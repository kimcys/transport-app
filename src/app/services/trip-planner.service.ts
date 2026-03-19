import { Injectable } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, shareReplay, switchMap } from 'rxjs';
import { Route, Trip } from '../models/route.model';
import { Stop, TripStop } from '../models/stop.model';
import {
  JourneyLeg,
  JourneyOption,
  JourneyRecommendations,
  PlannerPoint,
  PlannerStopCandidate,
  TripPlanResult
} from '../models/trip.model';
import { GtfsService } from './gtfs.service';
import { LocationService } from './location.service';
import { VehiclePosition } from '../models/vehicle.model';

interface PlannedTrip {
  route: Route;
  trip: Trip;
  stops: TripStop[];
}

interface DirectTripMatch {
  tripData: PlannedTrip;
  originCandidate: PlannerStopCandidate;
  destinationCandidate: PlannerStopCandidate;
  originStopTime: TripStop;
  destinationStopTime: TripStop;
}

interface OriginSegment {
  tripData: PlannedTrip;
  originCandidate: PlannerStopCandidate;
  originStopTime: TripStop;
  downstreamStops: TripStop[];
}

interface DestinationSegment {
  tripData: PlannedTrip;
  destinationCandidate: PlannerStopCandidate;
  destinationStopTime: TripStop;
  upstreamStops: TripStop[];
}

@Injectable({
  providedIn: 'root'
})
export class TripPlannerService {
  private readonly tripCache = new Map<string, Observable<PlannedTrip[]>>();

  constructor(
    private gtfsService: GtfsService,
    private locationService: LocationService
  ) { }

  planTrip(
    agency: string,
    category: string,
    routes: Route[],
    stops: Stop[],
    vehicles: VehiclePosition[],
    originPoint: PlannerPoint,
    destinationPoint: PlannerPoint
  ): Observable<TripPlanResult> {
    const originStops = this.findNearestStops(originPoint, stops);
    const destinationStops = this.findNearestStops(destinationPoint, stops);

    if (originStops.length === 0 || destinationStops.length === 0 || routes.length === 0) {
      return of({
        originPoint,
        destinationPoint,
        originStops,
        destinationStops,
        journeys: [],
        recommendations: this.emptyRecommendations()
      });
    }

    return this.getPlannedTrips(agency, category, routes).pipe(
      map((plannedTrips) => {
        const directJourneys = this.buildDirectJourneys(originPoint, destinationPoint, originStops, destinationStops, plannedTrips, vehicles);
        const transferJourneys = this.buildTransferJourneys(originPoint, destinationPoint, originStops, destinationStops, plannedTrips, vehicles);
        const journeys = [...directJourneys, ...transferJourneys]
          .sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes)
          .slice(0, 12);

        return {
          originPoint,
          destinationPoint,
          originStops,
          destinationStops,
          journeys,
          recommendations: this.buildRecommendations(journeys)
        };
      })
    );
  }

  private getPlannedTrips(agency: string, category: string, routes: Route[]): Observable<PlannedTrip[]> {
    const cacheKey = `${agency}::${category || 'all'}::${routes.map((route) => route.route_id).join('|')}`;
    const cached = this.tripCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request = forkJoin(
      routes.map((route) =>
        this.gtfsService.getTripsForRoute(agency, route.route_id, category).pipe(
          catchError(() => of([] as Trip[])),
          switchMap((trips) => {
            if (trips.length === 0) {
              return of([] as PlannedTrip[]);
            }

            return forkJoin(
              trips.map((trip) =>
                this.gtfsService.getStopTimesForTrip(agency, trip.trip_id).pipe(
                  catchError(() => of([] as TripStop[])),
                  map((tripStops) => ({
                    route,
                    trip,
                    stops: [...tripStops].sort((a, b) => a.stop_sequence - b.stop_sequence)
                  }))
                )
              )
            );
          })
        )
      )
    ).pipe(
      map((tripGroups) => tripGroups.flat().filter((trip) => trip.stops.length > 1)),
      shareReplay(1)
    );

    this.tripCache.set(cacheKey, request);
    return request;
  }

  private findNearestStops(point: PlannerPoint, stops: Stop[], limit: number = 4): PlannerStopCandidate[] {
    const candidates = stops
      .map((stop) => ({
        stop,
        distanceKm: this.locationService.calculateDistance(point.lat, point.lng, stop.stop_lat, stop.stop_lon)
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    if (point.stop && !candidates.find((candidate) => candidate.stop.stop_id === point.stop?.stop_id)) {
      candidates.unshift({
        stop: point.stop,
        distanceKm: 0
      });
    }

    return candidates.slice(0, limit);
  }

  private buildDirectJourneys(
    originPoint: PlannerPoint,
    destinationPoint: PlannerPoint,
    originStops: PlannerStopCandidate[],
    destinationStops: PlannerStopCandidate[],
    plannedTrips: PlannedTrip[],
    vehicles: VehiclePosition[]
  ): JourneyOption[] {
    const matches: DirectTripMatch[] = [];

    plannedTrips.forEach((tripData) => {
      originStops.forEach((originCandidate) => {
        const originStopTime = tripData.stops.find((stopTime) => stopTime.stop_id === originCandidate.stop.stop_id);
        if (!originStopTime) {
          return;
        }

        destinationStops.forEach((destinationCandidate) => {
          const destinationStopTime = tripData.stops.find((stopTime) => stopTime.stop_id === destinationCandidate.stop.stop_id);
          if (!destinationStopTime || destinationStopTime.stop_sequence <= originStopTime.stop_sequence) {
            return;
          }

          matches.push({
            tripData,
            originCandidate,
            destinationCandidate,
            originStopTime,
            destinationStopTime
          });
        });
      });
    });

    return matches
      .map((match) => this.createDirectJourney(match, originPoint, destinationPoint, vehicles))
      .sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes)
      .filter((journey, index, journeys) => journeys.findIndex((candidate) => candidate.id === journey.id) === index)
      .slice(0, 8);
  }

  private buildTransferJourneys(
    originPoint: PlannerPoint,
    destinationPoint: PlannerPoint,
    originStops: PlannerStopCandidate[],
    destinationStops: PlannerStopCandidate[],
    plannedTrips: PlannedTrip[],
    vehicles: VehiclePosition[]
  ): JourneyOption[] {
    const originSegments: OriginSegment[] = [];
    const destinationSegments: DestinationSegment[] = [];

    plannedTrips.forEach((tripData) => {
      originStops.forEach((originCandidate) => {
        const originStopTime = tripData.stops.find((stopTime) => stopTime.stop_id === originCandidate.stop.stop_id);
        if (originStopTime) {
          originSegments.push({
            tripData,
            originCandidate,
            originStopTime,
            downstreamStops: tripData.stops.filter((stopTime) => stopTime.stop_sequence > originStopTime.stop_sequence)
          });
        }
      });

      destinationStops.forEach((destinationCandidate) => {
        const destinationStopTime = tripData.stops.find((stopTime) => stopTime.stop_id === destinationCandidate.stop.stop_id);
        if (destinationStopTime) {
          destinationSegments.push({
            tripData,
            destinationCandidate,
            destinationStopTime,
            upstreamStops: tripData.stops.filter((stopTime) => stopTime.stop_sequence < destinationStopTime.stop_sequence)
          });
        }
      });
    });

    const journeys: JourneyOption[] = [];

    originSegments.forEach((firstLeg) => {
      destinationSegments.forEach((secondLeg) => {
        if (firstLeg.tripData.route.route_id === secondLeg.tripData.route.route_id) {
          return;
        }

        const transferStop = firstLeg.downstreamStops.find((downstreamStop) =>
          secondLeg.upstreamStops.some((upstreamStop) => upstreamStop.stop_id === downstreamStop.stop_id)
        );

        if (!transferStop) {
          return;
        }

        const secondTransferStop = secondLeg.upstreamStops.find((stopTime) => stopTime.stop_id === transferStop.stop_id);
        if (!secondTransferStop) {
          return;
        }

        const firstArrival = this.timeToMinutes(transferStop.arrival_time);
        const secondDeparture = this.timeToMinutes(secondTransferStop.departure_time);
        const transferWait = this.wrapDifference(firstArrival, secondDeparture);

        if (transferWait > 45) {
          return;
        }

        journeys.push(this.createTransferJourney(
          firstLeg,
          secondLeg,
          transferStop,
          secondTransferStop,
          originPoint,
          destinationPoint,
          vehicles
        ));
      });
    });

    return journeys
      .sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes)
      .filter((journey, index, allJourneys) => allJourneys.findIndex((candidate) => candidate.id === journey.id) === index)
      .slice(0, 6);
  }

  private createDirectJourney(
    match: DirectTripMatch,
    originPoint: PlannerPoint,
    destinationPoint: PlannerPoint,
    vehicles: VehiclePosition[]
  ): JourneyOption {
    const departureMinutes = this.timeToMinutes(match.originStopTime.departure_time);
    const arrivalMinutes = this.timeToMinutes(match.destinationStopTime.arrival_time);
    const rideMinutes = this.wrapDifference(departureMinutes, arrivalMinutes);
    const waitMinutes = this.minutesUntil(departureMinutes);
    const walkToOriginMeters = Math.round(match.originCandidate.distanceKm * 1000);
    const walkToDestinationMeters = Math.round(match.destinationCandidate.distanceKm * 1000);
    const walkingDistanceMeters = walkToOriginMeters + walkToDestinationMeters;
    const walkingTimeMinutes = this.walkingMinutes(walkingDistanceMeters);
    const totalDurationMinutes = walkingTimeMinutes + waitMinutes + rideMinutes;
    const stopCount = match.destinationStopTime.stop_sequence - match.originStopTime.stop_sequence;
    const route = match.tripData.route;
    const fare = this.estimateFare(stopCount, 0);
    const reliabilityScore = this.estimateReliability([route], vehicles);
    const transitPath = this.sliceTripPath(match.tripData.stops, match.originStopTime.stop_sequence, match.destinationStopTime.stop_sequence);

    const legs: JourneyLeg[] = [
      {
        type: 'walk',
        title: `Walk to ${match.originCandidate.stop.stop_name}`,
        durationMinutes: this.walkingMinutes(walkToOriginMeters),
        distanceMeters: walkToOriginMeters,
        toStop: match.originCandidate.stop
      },
      {
        type: 'ride',
        title: `Take ${route.route_short_name || route.route_id}`,
        durationMinutes: rideMinutes,
        route,
        fromStop: match.originCandidate.stop,
        toStop: match.destinationCandidate.stop,
        stopCount
      },
      {
        type: 'walk',
        title: `Walk to ${destinationPoint.label}`,
        durationMinutes: this.walkingMinutes(walkToDestinationMeters),
        distanceMeters: walkToDestinationMeters,
        fromStop: match.destinationCandidate.stop
      }
    ];

    return {
      id: `direct:${match.tripData.trip.trip_id}:${match.originCandidate.stop.stop_id}:${match.destinationCandidate.stop.stop_id}`,
      label: route.route_short_name || route.route_id,
      summary: `${totalDurationMinutes} min, direct`,
      originStop: match.originCandidate.stop,
      destinationStop: match.destinationCandidate.stop,
      routes: [route],
      totalDurationMinutes,
      waitingTimeMinutes: waitMinutes,
      walkingTimeMinutes,
      inVehicleTimeMinutes: rideMinutes,
      walkingDistanceMeters,
      transferCount: 0,
      estimatedFare: fare,
      reliabilityScore,
      departureTimeText: this.formatTime(match.originStopTime.departure_time),
      arrivalTimeText: this.formatTime(match.destinationStopTime.arrival_time),
      legs,
      mapSegments: [
        {
          kind: 'walk',
          path: [
            { lat: originPoint.lat, lng: originPoint.lng },
            { lat: match.originCandidate.stop.stop_lat, lng: match.originCandidate.stop.stop_lon }
          ]
        },
        {
          kind: 'transit',
          path: transitPath
        },
        {
          kind: 'walk',
          path: [
            { lat: match.destinationCandidate.stop.stop_lat, lng: match.destinationCandidate.stop.stop_lon },
            { lat: destinationPoint.lat, lng: destinationPoint.lng }
          ]
        }
      ],
      mapMarkers: [
        {
          id: `start-${match.originCandidate.stop.stop_id}`,
          label: 'Start',
          position: { lat: originPoint.lat, lng: originPoint.lng },
          kind: 'start'
        },
        {
          id: `end-${match.destinationCandidate.stop.stop_id}`,
          label: 'End',
          position: { lat: destinationPoint.lat, lng: destinationPoint.lng },
          kind: 'end'
        }
      ]
    };
  }

  private createTransferJourney(
    firstLeg: OriginSegment,
    secondLeg: DestinationSegment,
    transferStopTime: TripStop,
    secondTransferStopTime: TripStop,
    originPoint: PlannerPoint,
    destinationPoint: PlannerPoint,
    vehicles: VehiclePosition[]
  ): JourneyOption {
    const walkToOriginMeters = Math.round(firstLeg.originCandidate.distanceKm * 1000);
    const walkToDestinationMeters = Math.round(secondLeg.destinationCandidate.distanceKm * 1000);
    const firstRideMinutes = this.wrapDifference(
      this.timeToMinutes(firstLeg.originStopTime.departure_time),
      this.timeToMinutes(transferStopTime.arrival_time)
    );
    const secondRideMinutes = this.wrapDifference(
      this.timeToMinutes(secondTransferStopTime.departure_time),
      this.timeToMinutes(secondLeg.destinationStopTime.arrival_time)
    );
    const waitBeforeFirstRide = this.minutesUntil(this.timeToMinutes(firstLeg.originStopTime.departure_time));
    const transferWait = this.wrapDifference(
      this.timeToMinutes(transferStopTime.arrival_time),
      this.timeToMinutes(secondTransferStopTime.departure_time)
    );
    const walkingDistanceMeters = walkToOriginMeters + walkToDestinationMeters;
    const walkingTimeMinutes = this.walkingMinutes(walkingDistanceMeters);
    const totalDurationMinutes = walkingTimeMinutes + waitBeforeFirstRide + transferWait + firstRideMinutes + secondRideMinutes;
    const fare = this.estimateFare(
      (transferStopTime.stop_sequence - firstLeg.originStopTime.stop_sequence) +
      (secondLeg.destinationStopTime.stop_sequence - secondTransferStopTime.stop_sequence),
      1
    );
    const reliabilityScore = this.estimateReliability(
      [firstLeg.tripData.route, secondLeg.tripData.route],
      vehicles
    );

    const legs: JourneyLeg[] = [
      {
        type: 'walk',
        title: `Walk to ${firstLeg.originCandidate.stop.stop_name}`,
        durationMinutes: this.walkingMinutes(walkToOriginMeters),
        distanceMeters: walkToOriginMeters,
        toStop: firstLeg.originCandidate.stop
      },
      {
        type: 'ride',
        title: `Take ${firstLeg.tripData.route.route_short_name || firstLeg.tripData.route.route_id}`,
        durationMinutes: firstRideMinutes,
        route: firstLeg.tripData.route,
        fromStop: firstLeg.originCandidate.stop,
        toStop: {
          stop_id: transferStopTime.stop_id,
          stop_name: transferStopTime.stop_name,
          stop_lat: transferStopTime.stop_lat,
          stop_lon: transferStopTime.stop_lon
        },
        stopCount: transferStopTime.stop_sequence - firstLeg.originStopTime.stop_sequence
      },
      {
        type: 'transfer',
        title: `Transfer at ${transferStopTime.stop_name}`,
        durationMinutes: transferWait,
        fromStop: {
          stop_id: transferStopTime.stop_id,
          stop_name: transferStopTime.stop_name,
          stop_lat: transferStopTime.stop_lat,
          stop_lon: transferStopTime.stop_lon
        }
      },
      {
        type: 'ride',
        title: `Take ${secondLeg.tripData.route.route_short_name || secondLeg.tripData.route.route_id}`,
        durationMinutes: secondRideMinutes,
        route: secondLeg.tripData.route,
        fromStop: {
          stop_id: secondTransferStopTime.stop_id,
          stop_name: secondTransferStopTime.stop_name,
          stop_lat: secondTransferStopTime.stop_lat,
          stop_lon: secondTransferStopTime.stop_lon
        },
        toStop: secondLeg.destinationCandidate.stop,
        stopCount: secondLeg.destinationStopTime.stop_sequence - secondTransferStopTime.stop_sequence
      },
      {
        type: 'walk',
        title: `Walk to ${destinationPoint.label}`,
        durationMinutes: this.walkingMinutes(walkToDestinationMeters),
        distanceMeters: walkToDestinationMeters,
        fromStop: secondLeg.destinationCandidate.stop
      }
    ];

    return {
      id: `transfer:${firstLeg.tripData.trip.trip_id}:${secondLeg.tripData.trip.trip_id}:${transferStopTime.stop_id}`,
      label: `${firstLeg.tripData.route.route_short_name || firstLeg.tripData.route.route_id} → ${secondLeg.tripData.route.route_short_name || secondLeg.tripData.route.route_id}`,
      summary: `${totalDurationMinutes} min, 1 transfer`,
      originStop: firstLeg.originCandidate.stop,
      destinationStop: secondLeg.destinationCandidate.stop,
      transferStop: {
        stop_id: transferStopTime.stop_id,
        stop_name: transferStopTime.stop_name,
        stop_lat: transferStopTime.stop_lat,
        stop_lon: transferStopTime.stop_lon
      },
      routes: [firstLeg.tripData.route, secondLeg.tripData.route],
      totalDurationMinutes,
      waitingTimeMinutes: waitBeforeFirstRide + transferWait,
      walkingTimeMinutes,
      inVehicleTimeMinutes: firstRideMinutes + secondRideMinutes,
      walkingDistanceMeters,
      transferCount: 1,
      estimatedFare: fare,
      reliabilityScore,
      departureTimeText: this.formatTime(firstLeg.originStopTime.departure_time),
      arrivalTimeText: this.formatTime(secondLeg.destinationStopTime.arrival_time),
      legs,
      mapSegments: [
        {
          kind: 'walk',
          path: [
            { lat: originPoint.lat, lng: originPoint.lng },
            { lat: firstLeg.originCandidate.stop.stop_lat, lng: firstLeg.originCandidate.stop.stop_lon }
          ]
        },
        {
          kind: 'transit',
          path: this.sliceTripPath(firstLeg.tripData.stops, firstLeg.originStopTime.stop_sequence, transferStopTime.stop_sequence)
        },
        {
          kind: 'transit',
          path: this.sliceTripPath(secondLeg.tripData.stops, secondTransferStopTime.stop_sequence, secondLeg.destinationStopTime.stop_sequence)
        },
        {
          kind: 'walk',
          path: [
            { lat: secondLeg.destinationCandidate.stop.stop_lat, lng: secondLeg.destinationCandidate.stop.stop_lon },
            { lat: destinationPoint.lat, lng: destinationPoint.lng }
          ]
        }
      ],
      mapMarkers: [
        {
          id: `start-${firstLeg.originCandidate.stop.stop_id}`,
          label: 'Start',
          position: { lat: originPoint.lat, lng: originPoint.lng },
          kind: 'start'
        },
        {
          id: `transfer-${transferStopTime.stop_id}`,
          label: '1',
          position: { lat: transferStopTime.stop_lat, lng: transferStopTime.stop_lon },
          kind: 'transfer'
        },
        {
          id: `end-${secondLeg.destinationCandidate.stop.stop_id}`,
          label: 'End',
          position: { lat: destinationPoint.lat, lng: destinationPoint.lng },
          kind: 'end'
        }
      ]
    };
  }

  private buildRecommendations(journeys: JourneyOption[]): JourneyRecommendations {
    return {
      bestOverall: this.pickBest(journeys, (journey) =>
        journey.totalDurationMinutes +
        journey.transferCount * 8 +
        journey.walkingDistanceMeters / 150 +
        (1 - journey.reliabilityScore) * 20
      ),
      fastest: this.pickBest(journeys, (journey) => journey.totalDurationMinutes),
      leastWalking: this.pickBest(journeys, (journey) => journey.walkingDistanceMeters),
      fewestTransfers: this.pickBest(journeys, (journey) => journey.transferCount * 1000 + journey.totalDurationMinutes),
      cheapest: this.pickBest(journeys, (journey) => journey.estimatedFare * 100 + journey.totalDurationMinutes),
      mostReliable: this.pickBest(journeys, (journey) => (1 - journey.reliabilityScore) * 100 + journey.totalDurationMinutes / 10)
    };
  }

  private pickBest(journeys: JourneyOption[], score: (journey: JourneyOption) => number): JourneyOption | null {
    if (journeys.length === 0) {
      return null;
    }

    return [...journeys].sort((a, b) => score(a) - score(b))[0];
  }

  private emptyRecommendations(): JourneyRecommendations {
    return {
      bestOverall: null,
      fastest: null,
      leastWalking: null,
      fewestTransfers: null,
      cheapest: null,
      mostReliable: null
    };
  }

  private estimateFare(stopCount: number, transferCount: number): number {
    return Number((1.2 + stopCount * 0.18 + transferCount * 0.6).toFixed(2));
  }

  private estimateReliability(routes: Route[], vehicles: VehiclePosition[]): number {
    const liveRoutes = new Set(vehicles.map((vehicle) => vehicle.route_id));
    const liveMatches = routes.filter((route) => liveRoutes.has(route.route_id)).length;
    return Math.min(0.98, 0.55 + (liveMatches / Math.max(routes.length, 1)) * 0.35);
  }

  private walkingMinutes(distanceMeters: number): number {
    return Math.max(1, Math.round(distanceMeters / 80));
  }

  private sliceTripPath(stops: TripStop[], startSequence: number, endSequence: number): google.maps.LatLngLiteral[] {
    return stops
      .filter((stop) => stop.stop_sequence >= startSequence && stop.stop_sequence <= endSequence)
      .map((stop) => ({ lat: stop.stop_lat, lng: stop.stop_lon }));
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private wrapDifference(startMinutes: number, endMinutes: number): number {
    const difference = endMinutes - startMinutes;
    return difference >= 0 ? difference : difference + 24 * 60;
  }

  private minutesUntil(targetMinutes: number): number {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return this.wrapDifference(nowMinutes, targetMinutes);
  }

  private formatTime(time: string): string {
    const [hoursText, minutesText] = time.split(':');
    const hours = Number(hoursText) % 24;
    const period = hours >= 12 ? 'PM' : 'AM';
    const normalizedHours = hours % 12 || 12;
    return `${normalizedHours}:${minutesText} ${period}`;
  }
}
