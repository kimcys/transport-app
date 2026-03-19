import { Injectable } from '@angular/core';
import { Observable, from, map, of, switchMap } from 'rxjs';
import {
  JourneyLeg,
  JourneyMapMarker,
  JourneyMapSegment,
  JourneyOption,
  JourneyRecommendations,
  PlannerPoint
} from '../models/trip.model';

export interface GooglePlaceSuggestion {
  placeId: string;
  label: string;
  secondaryText: string;
}

@Injectable({
  providedIn: 'root'
})
export class GoogleTripPlannerService {
  private autocompleteService?: google.maps.places.AutocompleteService;
  private geocoder?: google.maps.Geocoder;
  private directionsService?: google.maps.DirectionsService;

  searchPlaces(query: string, locationBias?: google.maps.LatLngLiteral): Observable<GooglePlaceSuggestion[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || !this.isGoogleMapsReady()) {
      return of([]);
    }

    const service = this.getAutocompleteService();

    return from(service.getPlacePredictions({
      input: trimmedQuery,
      componentRestrictions: { country: 'my' },
      locationBias: locationBias ? new google.maps.Circle({ center: locationBias, radius: 50000 }) : undefined
    })).pipe(
      map((response) =>
        (response.predictions ?? []).slice(0, 6).map((prediction) => ({
          placeId: prediction.place_id,
          label: prediction.structured_formatting.main_text,
          secondaryText: prediction.structured_formatting.secondary_text ?? prediction.description
        }))
      )
    );
  }

  resolvePlace(placeId: string): Observable<PlannerPoint | null> {
    if (!this.isGoogleMapsReady()) {
      return of(null);
    }

    const geocoder = this.getGeocoder();

    return from(geocoder.geocode({ placeId })).pipe(
      map((response) => {
        const result = response.results?.[0];
        const location = result?.geometry.location;

        if (!result || !location) {
          return null;
        }

        return {
          type: 'stop',
          label: result.formatted_address || 'Selected place',
          lat: location.lat(),
          lng: location.lng()
        } satisfies PlannerPoint;
      })
    );
  }

  planTransitJourneys(origin: PlannerPoint, destination: PlannerPoint): Observable<JourneyOption[]> {
    if (!this.isGoogleMapsReady()) {
      return of([]);
    }

    const directionsService = this.getDirectionsService();

    return from(directionsService.route({
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      travelMode: google.maps.TravelMode.TRANSIT,
      provideRouteAlternatives: true,
      region: 'MY',
      transitOptions: {
        departureTime: new Date(),
        modes: [
          google.maps.TransitMode.BUS,
          google.maps.TransitMode.RAIL,
          google.maps.TransitMode.TRAIN,
          google.maps.TransitMode.SUBWAY
        ]
      }
    })).pipe(
      map((response) =>
        (response.routes ?? []).map((route, index) => this.toJourneyOption(route, origin, destination, index))
      )
    );
  }

  buildRecommendations(journeys: JourneyOption[]): JourneyRecommendations {
    const pick = (score: (journey: JourneyOption) => number) =>
      journeys.length ? [...journeys].sort((a, b) => score(a) - score(b))[0] : null;

    return {
      bestOverall: pick((journey) => journey.totalDurationMinutes + journey.transferCount * 10 + journey.walkingDistanceMeters / 180),
      fastest: pick((journey) => journey.totalDurationMinutes),
      leastWalking: pick((journey) => journey.walkingDistanceMeters),
      fewestTransfers: pick((journey) => journey.transferCount * 1000 + journey.totalDurationMinutes),
      cheapest: pick((journey) => journey.estimatedFare * 100 + journey.totalDurationMinutes),
      mostReliable: pick((journey) => (1 - journey.reliabilityScore) * 100 + journey.totalDurationMinutes)
    };
  }

  private toJourneyOption(
    route: google.maps.DirectionsRoute,
    origin: PlannerPoint,
    destination: PlannerPoint,
    index: number
  ): JourneyOption {
    const leg = route.legs[0];
    const steps = leg.steps ?? [];
    const journeyLegs: JourneyLeg[] = [];
    const mapSegments: JourneyMapSegment[] = [];
    const mapMarkers: JourneyMapMarker[] = [
      {
        id: `start-${index}`,
        label: 'Start',
        position: { lat: origin.lat, lng: origin.lng },
        kind: 'start'
      },
      {
        id: `end-${index}`,
        label: 'End',
        position: { lat: destination.lat, lng: destination.lng },
        kind: 'end'
      }
    ];

    let walkingDistanceMeters = 0;
    let walkingTimeMinutes = 0;
    let inVehicleTimeMinutes = 0;
    let waitingTimeMinutes = 0;
    let transferCount = 0;
    let estimatedFare = 2.4;
    const routesUsed = new Map<string, string>();

    steps.forEach((step, stepIndex) => {
      const durationMinutes = Math.max(1, Math.round((step.duration?.value ?? 0) / 60));
      const distanceMeters = step.distance?.value ?? 0;
      const path = (step.path ?? []).map((point) => ({ lat: point.lat(), lng: point.lng() }));

      if (step.travel_mode === google.maps.TravelMode.WALKING) {
        walkingDistanceMeters += distanceMeters;
        walkingTimeMinutes += durationMinutes;
        journeyLegs.push({
          type: 'walk',
          title: this.cleanInstruction(step.instructions || 'Walk'),
          durationMinutes,
          distanceMeters
        });
        if (path.length > 1) {
          mapSegments.push({ kind: 'walk', path });
        }
        return;
      }

      if (step.travel_mode === google.maps.TravelMode.TRANSIT && step.transit) {
        const transit = step.transit;
        const lineName = transit.line.short_name || transit.line.name || transit.line.vehicle?.name || 'Transit';
        const vehicleName = transit.line.vehicle?.name || 'Vehicle';
        const routeId = `${vehicleName}:${lineName}`;
        routesUsed.set(routeId, lineName);
        inVehicleTimeMinutes += durationMinutes;
        waitingTimeMinutes += this.estimateWaitingMinutes(transit);
        estimatedFare += this.estimateTransitFare(vehicleName, transit.num_stops ?? 0);

        journeyLegs.push({
          type: 'ride',
          title: `${vehicleName}: ${lineName}`,
          durationMinutes,
          route: {
            route_id: routeId,
            route_short_name: lineName,
            route_long_name: transit.headsign || transit.line.name || lineName,
            route_type: 3
          },
          stopCount: transit.num_stops ?? undefined,
          fromStop: transit.departure_stop ? {
            stop_id: transit.departure_stop.name,
            stop_name: transit.departure_stop.name,
            stop_lat: step.start_location.lat(),
            stop_lon: step.start_location.lng()
          } : undefined,
          toStop: transit.arrival_stop ? {
            stop_id: transit.arrival_stop.name,
            stop_name: transit.arrival_stop.name,
            stop_lat: step.end_location.lat(),
            stop_lon: step.end_location.lng()
          } : undefined
        });

        if (path.length > 1) {
          mapSegments.push({ kind: 'transit', path });
        }

        if (stepIndex > 0 && steps[stepIndex - 1].travel_mode === google.maps.TravelMode.TRANSIT) {
          transferCount += 1;
          mapMarkers.push({
            id: `transfer-${index}-${stepIndex}`,
            label: `${transferCount}`,
            position: { lat: step.start_location.lat(), lng: step.start_location.lng() },
            kind: 'transfer'
          });
        }
      }
    });

    const totalDurationMinutes = Math.max(1, Math.round((leg.duration?.value ?? 0) / 60));
    const departureTimeText = leg.departure_time?.text ?? 'Now';
    const arrivalTimeText = leg.arrival_time?.text ?? 'Soon';
    const reliabilityScore = this.estimateReliabilityFromSteps(steps);
    const routeLabels = Array.from(routesUsed.values());
    const summary = `${totalDurationMinutes} min, ${transferCount} transfer${transferCount === 1 ? '' : 's'}`;

    return {
      id: `google-route-${index}`,
      label: routeLabels.length ? routeLabels.join(' -> ') : 'Transit option',
      summary,
      originStop: {
        stop_id: origin.label,
        stop_name: origin.label,
        stop_lat: origin.lat,
        stop_lon: origin.lng
      },
      destinationStop: {
        stop_id: destination.label,
        stop_name: destination.label,
        stop_lat: destination.lat,
        stop_lon: destination.lng
      },
      routes: Array.from(routesUsed.entries()).map(([routeId, label]) => ({
        route_id: routeId,
        route_short_name: label,
        route_long_name: label,
        route_type: 3
      })),
      totalDurationMinutes,
      waitingTimeMinutes,
      walkingTimeMinutes,
      inVehicleTimeMinutes,
      walkingDistanceMeters,
      transferCount,
      estimatedFare: Number(estimatedFare.toFixed(2)),
      reliabilityScore,
      departureTimeText,
      arrivalTimeText,
      legs: journeyLegs,
      mapSegments,
      mapMarkers
    };
  }

  private estimateWaitingMinutes(transit: google.maps.TransitDetails): number {
    if (!transit.departure_time?.value) {
      return 0;
    }

    const now = Date.now();
    const departureMs = transit.departure_time.value.getTime();
    const diffMinutes = Math.round((departureMs - now) / 60000);
    return Math.max(0, diffMinutes);
  }

  private estimateTransitFare(vehicleName: string, stopCount: number): number {
    const baseFare = vehicleName.toLowerCase().includes('train') || vehicleName.toLowerCase().includes('rail') ? 1.8 : 1.2;
    return baseFare + stopCount * 0.12;
  }

  private estimateReliabilityFromSteps(steps: google.maps.DirectionsStep[]): number {
    const transitCount = steps.filter((step) => step.travel_mode === google.maps.TravelMode.TRANSIT).length;
    return Math.max(0.55, Math.min(0.95, 0.9 - transitCount * 0.08));
  }

  private cleanInstruction(instruction: string): string {
    const container = document.createElement('div');
    container.innerHTML = instruction;
    return container.textContent?.trim() || 'Walk';
  }

  private isGoogleMapsReady(): boolean {
    return typeof google !== 'undefined' && !!google.maps?.places;
  }

  private getAutocompleteService(): google.maps.places.AutocompleteService {
    this.autocompleteService ??= new google.maps.places.AutocompleteService();
    return this.autocompleteService;
  }

  private getGeocoder(): google.maps.Geocoder {
    this.geocoder ??= new google.maps.Geocoder();
    return this.geocoder;
  }

  private getDirectionsService(): google.maps.DirectionsService {
    this.directionsService ??= new google.maps.DirectionsService();
    return this.directionsService;
  }
}
