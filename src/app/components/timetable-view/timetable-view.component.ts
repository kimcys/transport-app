import { Component, EventEmitter, Input, Output, SimpleChanges } from '@angular/core';
import { TripStop } from '../../models/stop.model';
import { Route } from '../../models/route.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-timetable-view',
  imports: [CommonModule],
  templateUrl: './timetable-view.component.html',
  styleUrl: './timetable-view.component.css'
})
export class TimetableViewComponent {

  @Input() stops: TripStop[] = [];
  @Input() route: Route | null = null;
  @Input() loading = false;

  @Output() selectStop = new EventEmitter<{ lat: number; lng: number }>();
  @Output() close = new EventEmitter<void>();

  expandedStops: Set<number> = new Set();

  ngOnChanges(changes: SimpleChanges) {
    if (changes['stops']) {
      // Auto-expand first stop
      if (this.stops.length > 0) {
        this.expandedStops.clear();
        this.expandedStops.add(0);
      }
    }
  }

  formatTime(time: string): string {
    return time.substring(0, 5);
  }

  toggleStop(index: number) {
    if (this.expandedStops.has(index)) {
      this.expandedStops.delete(index);
    } else {
      this.expandedStops.add(index);
    }
  }

  onStopClick(lat: number, lng: number) {
    this.selectStop.emit({ lat, lng });
  }

  calculateDuration(arrival: string, departure: string): string {
    const arr = this.timeToMinutes(arrival);
    const dep = this.timeToMinutes(departure);
    const diff = dep - arr;

    if (diff <= 0) return '0 min';
    return `${diff} min`;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  isDataComplete(): boolean {
    if (!this.stops || this.stops.length === 0) return false;

    // Check if all required fields are present
    return this.stops.every(stop =>
      stop.stop_id &&
      stop.stop_name &&
      stop.arrival_time &&
      stop.departure_time &&
      stop.stop_sequence !== undefined &&
      stop.stop_lat !== undefined &&
      stop.stop_lon !== undefined
    );
  }

}
