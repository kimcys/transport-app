// timetable-view.component.ts
import { Component, EventEmitter, Input, Output, SimpleChanges } from '@angular/core';
import { TripStop, Stop } from '../../models/stop.model';  // Import Stop
import { Route, TimePeriod, Trip, TripWithStops } from '../../models/route.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-timetable-view',
  imports: [CommonModule],
  templateUrl: './timetable-view.component.html',
  styleUrls: ['./timetable-view.component.css']
})
export class TimetableViewComponent {
  @Input() stopTimes: TripStop[] = [];
  @Input() trips: Trip[] = [];
  @Input() route: Route | null = null;
  @Input() loading = false;
  @Input() stops: Stop[] = [];  // ADD THIS LINE

  @Output() selectStop = new EventEmitter<{ lat: number; lng: number }>();
  @Output() close = new EventEmitter<void>();

  expandedTrips: Set<string> = new Set();
  tripsWithStops: TripWithStops[] = [];
  now = new Date();

  // Group trips by time of day - simplified periods
  timePeriods: TimePeriod[] = [
    { name: '🌅 Morning', trips: [], startHour: 0, endHour: 12 },
    { name: '☀️ Afternoon', trips: [], startHour: 12, endHour: 17 },
    { name: '🌆 Evening', trips: [], startHour: 17, endHour: 20 },
    { name: '🌙 Night', trips: [], startHour: 20, endHour: 24 }
  ];

  // Track which stop is expanded in each trip
  expandedStops: Map<string, number> = new Map();

  get totalTrips(): number {
    return this.tripsWithStops.length;
  }

  get totalStops(): number {
    return this.stopTimes.length;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['stopTimes'] || changes['trips']) {
      this.processTrips();
    }
  }

  processTrips() {
    if (!this.stopTimes.length) return;

    // Group stop times by trip_id
    const stopsByTrip = new Map<string, TripStop[]>();
    this.stopTimes.forEach(stop => {
      if (!stopsByTrip.has(stop.trip_id)) {
        stopsByTrip.set(stop.trip_id, []);
      }
      stopsByTrip.get(stop.trip_id)!.push(stop);
    });

    // Create TripWithStops objects
    this.tripsWithStops = [];
    stopsByTrip.forEach((stops, tripId) => {
      stops.sort((a, b) => a.stop_sequence - b.stop_sequence);

      const tripInfo = this.trips.find(t => t.trip_id === tripId);

      if (stops.length > 0) {
        const firstStop = stops[0];
        const lastStop = stops[stops.length - 1];

        this.tripsWithStops.push({
          trip_id: tripId,
          trip_headsign: tripInfo?.trip_headsign,
          stops: stops,
          firstStop: firstStop,
          lastStop: lastStop,
          duration: this.calculateTripDuration(stops)
        });
      }
    });

    // Sort trips by first stop time
    this.tripsWithStops.sort((a, b) => {
      const timeA = this.timeToMinutes(a.firstStop?.arrival_time || '00:00');
      const timeB = this.timeToMinutes(b.firstStop?.arrival_time || '00:00');
      return timeA - timeB;
    });

    // Filter for today's trips only (based on current time)
    this.filterTodayTrips();
  }

  filterTodayTrips() {
    this.groupTripsByTimePeriod();
  }

  groupTripsByTimePeriod() {
    // Reset periods
    this.timePeriods.forEach(p => p.trips = []);

    this.tripsWithStops.forEach(trip => {
      if (!trip.firstStop) return;

      const hour = this.timeToMinutes(trip.firstStop.arrival_time) / 60;

      const period = this.timePeriods.find(p =>
        hour >= p.startHour && hour < p.endHour
      );

      if (period) {
        period.trips.push(trip);
      }
    });

    // Filter out empty periods
    this.timePeriods = this.timePeriods.filter(p => p.trips.length > 0);
  }

  toggleTrip(tripId: string) {
    if (this.expandedTrips.has(tripId)) {
      this.expandedTrips.delete(tripId);
    } else {
      this.expandedTrips.clear();
      this.expandedTrips.add(tripId);
    }
  }

  toggleStop(tripId: string, stopIndex: number) {
    const key = `${tripId}-${stopIndex}`;
    if (this.expandedStops.has(key)) {
      this.expandedStops.delete(key);
    } else {
      // Clear other expanded stops in this trip
      Array.from(this.expandedStops.keys()).forEach(k => {
        if (k.startsWith(tripId)) {
          this.expandedStops.delete(k);
        }
      });
      this.expandedStops.set(key, stopIndex);
    }
  }

  isStopExpanded(tripId: string, stopIndex: number): boolean {
    return this.expandedStops.has(`${tripId}-${stopIndex}`);
  }

  isNextTrip(trip: TripWithStops): boolean {
    if (!trip.firstStop) return false;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const tripTime = this.timeToMinutes(trip.firstStop.arrival_time);

    return tripTime > currentTime && tripTime - currentTime < 60;
  }

  formatTime(time: string): string {
    if (!time) return '--:--';
    if (time >= '24:00') {
      const [hours, minutes] = time.split(':').map(Number);
      const nextDayHours = hours - 24;
      return `${nextDayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    return time.substring(0, 5);
  }

  // Update this method to use the stops data
  getStopName(stopId: string): string {
    const stop = this.stops.find(s => s.stop_id === stopId);
    return stop?.stop_name || stopId;
  }

  onStopClick(lat?: number, lng?: number, event?: Event) {
    event?.stopPropagation();
    if (lat && lng) {
      this.selectStop.emit({ lat, lng });
    }
  }

  calculateTripDuration(stops: TripStop[]): string {
    if (stops.length < 2) return '--';

    const firstTime = this.timeToMinutes(stops[0].arrival_time);
    let lastTime = this.timeToMinutes(stops[stops.length - 1].arrival_time);

    // Handle overnight trips (if last time is less than first time, it means we crossed midnight)
    if (lastTime < firstTime) {
      lastTime += 24 * 60; // Add 24 hours
    }

    const diff = lastTime - firstTime;

    if (diff < 60) return `${diff}m`;
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    return `${hours}h ${minutes}m`;
  }

  private timeToMinutes(time: string): number {
    if (!time) return 0;
    const [hours, minutes] = time.split(':').map(Number);

    // Handle times like 24:30, 25:00, etc. (next day times)
    if (hours >= 24) {
      return (hours - 24) * 60 + (minutes || 0);
    }

    return hours * 60 + (minutes || 0);
  }
}