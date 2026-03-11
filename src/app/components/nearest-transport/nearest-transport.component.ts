import { Component, Input, Output, EventEmitter } from '@angular/core';
import { NearestTransport } from '../../models/trip.model';
import { UserLocation } from '../../services/location.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-nearest-transport',
  templateUrl: './nearest-transport.component.html',
  imports: [CommonModule]
})
export class NearestTransportComponent {
  @Input() transports: NearestTransport[] = [];
  @Input() userLocation: UserLocation | null = null;
  @Input() loading = false;
  
  @Output() selectStop = new EventEmitter<{ lat: number; lng: number }>();

  formatTime(time: string): string {
    return time.substring(0, 5);
  }

  getVehicleStatus(transport: NearestTransport): string {
    if (!transport.vehicle) return 'No live data';
    return transport.vehicle.speed > 0 ? '🚌 Moving' : '⏸️ Stopped';
  }

  getDistanceColor(distance: number): string {
    if (distance < 0.5) return 'text-green-600';
    if (distance < 1) return 'text-yellow-600';
    return 'text-orange-600';
  }

  onStopClick(lat: number, lng: number) {
    this.selectStop.emit({ lat, lng });
  }
}