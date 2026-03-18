import { Component } from '@angular/core';
import { Feed } from '../../models/feed.model';
import { VehiclePosition } from '../../models/vehicle.model';
import { Route, Trip } from '../../models/route.model';
import { Stop, TripStop } from '../../models/stop.model';
import { NearestTransport } from '../../models/trip.model';
import { LocationService, UserLocation } from '../../services/location.service';
import { interval, Subscription, switchMap } from 'rxjs';
import { GtfsService } from '../../services/gtfs.service';
import { FiltersBarComponent } from '../../components/filters-bar/filters-bar.component';
import { NearestTransportComponent } from '../../components/nearest-transport/nearest-transport.component';
import { StatsCardsComponent } from '../../components/stats-cards/stats-cards.component';
import { TimetableViewComponent } from '../../components/timetable-view/timetable-view.component';
import { TransportMapComponent } from '../../components/transport-map/transport-map.component';
import { LiveVehicleListComponent } from '../../components/live-vehicle-list/live-vehicle-list.component';
import { CommonModule, DatePipe } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  imports: [
    FiltersBarComponent,
    LiveVehicleListComponent,
    NearestTransportComponent,
    StatsCardsComponent,
    TimetableViewComponent,
    TransportMapComponent,
    DatePipe,
    CommonModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {

  feeds: Feed | null = null;
  vehicles: VehiclePosition[] = [];
  routes: Route[] = [];
  stops: Stop[] = [];
  tripStops: TripStop[] = [];
  trips: Trip[] = [];
  nearestTransports: NearestTransport[] = [];

  // Selected items
  selectedAgency = '';
  selectedCategory = '';
  selectedRoute: Route | null = null;
  selectedTripId = '';

  // UI State
  loading = {
    feeds: false,
    routes: false,
    stops: false,
    vehicles: false,
    nearest: false,
    timetable: false
  };

  // Map
  mapCenter: google.maps.LatLngLiteral = { lat: 3.139, lng: 101.6869 };
  mapZoom = 12;

  // User location
  userLocation: UserLocation | null = null;

  // Timetable visibility
  showTimetable = false;

  // Last updated
  lastUpdated = new Date();

  private subscriptions: Subscription[] = [];
  private routesSub?: Subscription;
  private stopsSub?: Subscription;
  private vehiclesSub?: Subscription;
  private nearestSub?: Subscription;
  private timetableSub?: Subscription;
  private tripStopsSub?: Subscription;
  private stopTimesSubs: Subscription[] = [];

  constructor(
    private gtfsService: GtfsService,
    private locationService: LocationService
  ) { }

  ngOnInit() {
    this.loadInitialData();
    this.subscribeToLocation();
    this.loadVehicles();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  // ============== INITIALIZATION ==============
  loadInitialData() {
    this.loading.feeds = true;
    this.gtfsService.getFeeds().subscribe({
      next: (feeds) => {
        this.feeds = feeds;
        this.loading.feeds = false;
      },
      error: (err) => {
        console.error('Error loading feeds', err);
        this.loading.feeds = false;
      }
    });
  }

  subscribeToLocation() {
    this.subscriptions.push(
      this.locationService.userLocation$.subscribe(location => {
        this.userLocation = location;
        if (location) {
          this.mapCenter = { lat: location.lat, lng: location.lng };
          if (this.selectedAgency) {
            this.findNearestTransport();
          }
        }
      })
    );
  }

  // ============== DATA LOADING ==============
  onAgencyChange(agency: string) {
    this.selectedAgency = agency;
    this.selectedCategory = '';
    this.selectedRoute = null;
    this.showTimetable = false;

    this.routes = [];
    this.stops = [];
    this.vehicles = [];
    this.nearestTransports = [];

    if (agency) {
      this.loadRoutes();
      this.loadStops();
      this.loadVehicles(); // Add this
      this.findNearestTransport();
    }
  }

  onCategoryChange(category: string) {
    this.selectedCategory = category;
    this.routes = [];
    this.stops = [];
    this.vehicles = [];
    this.nearestTransports = [];

    this.loadRoutes();
    this.loadStops();
    this.loadVehicles(); // Add this
    this.findNearestTransport();
  }


  loadRoutes() {
    if (!this.selectedAgency) return;

    this.loading.routes = true;
    if (this.routesSub) this.routesSub.unsubscribe();

    this.routesSub = this.gtfsService.getRoutes(this.selectedAgency, this.selectedCategory).subscribe({
      next: (routes) => {
        this.routes = routes;
        this.loading.routes = false;
      },
      error: (err) => {
        console.error('Error loading routes', err);
        this.loading.routes = false;
      }
    });
  }

  loadStops(query: string = '') {
    if (!this.selectedAgency) return;

    this.loading.stops = true;
    if (this.stopsSub) this.stopsSub.unsubscribe();

    this.stopsSub = this.gtfsService.getStops(this.selectedAgency, this.selectedCategory, query).subscribe({
      next: (stops) => {
        this.stops = stops;
        this.loading.stops = false;
      },
      error: (err) => {
        console.error('Error loading stops', err);
        this.loading.stops = false;
      }
    });
  }

  onRouteSelect(route: Route) {
    this.selectedRoute = route;
    this.showTimetable = true;
    this.loading.timetable = true;

    if (this.timetableSub) this.timetableSub.unsubscribe();
    // Clear stop times subs as well when selecting a new route
    this.stopTimesSubs.forEach(s => s.unsubscribe());
    this.stopTimesSubs = [];

    this.timetableSub = this.gtfsService.getTripsForRoute(this.selectedAgency, route.route_id, this.selectedCategory)
      .subscribe({
        next: (trips) => {
          this.trips = trips;
          if (trips.length > 0) {
            // Load stop times for ALL trips, not just the first one
            this.loadAllTripStopTimes(trips);
          } else {
            this.loading.timetable = false;
          }
        },
        error: (err) => {
          console.error('Error loading trips', err);
          this.loading.timetable = false;
        }
      });

    // Re-calculate nearest transport specifically for this route
    this.findNearestTransport();
  }

  // New method to load stop times for all trips
  loadAllTripStopTimes(trips: Trip[]) {
    let completedRequests = 0;
    const allStopTimes: TripStop[] = [];

    this.stopTimesSubs.forEach(s => s.unsubscribe());
    this.stopTimesSubs = [];

    trips.forEach(trip => {
      const sub = this.gtfsService.getStopTimesForTrip(this.selectedAgency, trip.trip_id)
        .subscribe({
          next: (stops) => {
            allStopTimes.push(...stops);
            completedRequests++;

            // When all requests are complete, update the component
            if (completedRequests === trips.length) {
              this.tripStops = allStopTimes;
              this.loading.timetable = false;
            }
          },
          error: (err) => {
            console.error(`Error loading stop times for trip ${trip.trip_id}`, err);
            completedRequests++;

            // Even if some requests fail, still show what we have
            if (completedRequests === trips.length) {
              this.tripStops = allStopTimes;
              this.loading.timetable = false;
            }
          }
        });
      this.stopTimesSubs.push(sub);
    });
  }

  loadTripStopTimes() {
    if (!this.selectedTripId) return;

    if (this.tripStopsSub) this.tripStopsSub.unsubscribe();
    this.tripStopsSub = this.gtfsService.getStopTimesForTrip(this.selectedAgency, this.selectedTripId)
      .subscribe({
        next: (stops) => {
          this.tripStops = stops;
          this.loading.timetable = false;
        },
        error: (err) => {
          console.error('Error loading stop times', err);
          this.loading.timetable = false;
        }
      });
  }

  // ============== VEHICLE POLLING ==============
  // startVehiclePolling() {
  //   const pollSub = interval(30000).pipe(
  //     switchMap(() => {
  //       this.loading.vehicles = true;
  //       return this.gtfsService.getLatestVehiclePositions(
  //         this.selectedAgency, 
  //         this.selectedCategory
  //       );
  //     })
  //   ).subscribe({
  //     next: (vehicles) => {
  //       this.vehicles = vehicles;
  //       this.loading.vehicles = false;
  //       this.lastUpdated = new Date();
  //     },
  //     error: (err) => {
  //       console.error('Error loading vehicles', err);
  //       this.loading.vehicles = false;
  //     }
  //   });

  //   this.loadVehicles();

  //   this.subscriptions.push(pollSub);
  // }

  // Separate method for loading vehicles
  loadVehicles() {
    if (!this.selectedAgency) {
      this.vehicles = [];
      return;
    }

    this.loading.vehicles = true;
    if (this.vehiclesSub) this.vehiclesSub.unsubscribe();

    this.vehiclesSub = this.gtfsService.getLatestVehiclePositions(
      this.selectedAgency,
      this.selectedCategory
    ).subscribe({
      next: (vehicles) => {
        this.vehicles = vehicles;
        this.loading.vehicles = false;
        this.lastUpdated = new Date();
      },
      error: (err) => {
        console.error('Error loading vehicles', err);
        this.loading.vehicles = false;
      }
    });
  }

  refreshVehicles() {
    this.loadVehicles();
  }

  // ============== NEAREST TRANSPORT ==============
  findNearestTransport() {
    if (!this.userLocation || !this.selectedAgency) return;

    this.loading.nearest = true;
    this.nearestTransports = [];
    if (this.nearestSub) this.nearestSub.unsubscribe();

    // Get nearby stops
    this.nearestSub = this.gtfsService.getStops(this.selectedAgency, this.selectedCategory, '', 5000)
      .subscribe({
        next: (stops) => {
          // Calculate distances and sort
          const stopsWithDistance = stops.map(stop => ({
            ...stop,
            distance: this.locationService.calculateDistance(
              this.userLocation!.lat,
              this.userLocation!.lng,
              stop.stop_lat,
              stop.stop_lon
            )
          }))
            .filter(stop => stop.distance <= 50) // 50km geofence
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 5); // Top 5

          // For each stop, find routes and next departure
          stopsWithDistance.forEach(stop => {
            this.findRoutesForStop(stop);
          });

          this.loading.nearest = false;
        },
        error: (err) => {
          console.error('Error finding nearest stops', err);
          this.loading.nearest = false;
        }
      });
  }

  findRoutesForStop(stop: Stop & { distance: number }) {
    // Simplified - would need proper schedule calculation
    const targetRoutes = this.selectedRoute ? [this.selectedRoute] : this.routes;

    if (targetRoutes.length > 0) {
      const route = targetRoutes[0]; // Use selected route or first route for demo
      const vehicle = this.vehicles.find(v => v.route_id === route.route_id);

      // Calculate next departure (simplified)
      const now = new Date();
      const nextHour = now.getHours() + 1;
      const departureTime = `${nextHour.toString().padStart(2, '0')}:00:00`;
      const arrivalTime = this.addMinutes(departureTime, 30);

      this.nearestTransports.push({
        stop,
        route,
        departureTime,
        arrivalTime,
        vehicle,
        distance: stop.distance
      });
    }
  }

  // ============== MAP ACTIONS ==============
  onMapCenterChange(center: google.maps.LatLngLiteral) {
    this.mapCenter = center;
  }

  onSelectMapLocation(location: { lat: number; lng: number }) {
    this.mapCenter = location;
  }

  onMarkerClick(data: any) {
    // Handle marker click if needed
  }

  // ============== UTILITY ==============
  addMinutes(time: string, minutes: number): string {
    const [hours, mins, secs] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, mins + minutes, secs);
    return date.toTimeString().split(' ')[0];
  }

  closeTimetable() {
    this.showTimetable = false;
    this.selectedRoute = null;
  }
}