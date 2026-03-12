import { Component, EventEmitter, Input, Output } from '@angular/core';
import { VehiclePosition } from '../../models/vehicle.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-live-vehicle-list',
  imports: [CommonModule],
  templateUrl: './live-vehicle-list.component.html',
  styleUrl: './live-vehicle-list.component.css'
})
export class LiveVehicleListComponent {

  @Input() vehicles: VehiclePosition[] = [];
  @Input() loading = false;
  
  @Output() selectVehicle = new EventEmitter<{ lat: number; lng: number }>();
  @Output() refresh = new EventEmitter<void>();

  getVehicleStatus(vehicle: VehiclePosition): { text: string; color: string } {
    if (vehicle.speed === 0) {
      return { text: 'Stopped', color: 'text-orange-600' };
    }
    if (vehicle.speed < 10) {
      return { text: 'Moving Slow', color: 'text-yellow-600' };
    }
    return { text: 'Moving', color: 'text-green-600' };
  }

  onVehicleClick(vehicle: VehiclePosition) {
    this.selectVehicle.emit({ lat: vehicle.lat, lng: vehicle.lon });
  }

  trackByVehicleId(index: number, vehicle: VehiclePosition): string {
    return vehicle.vehicle_id;
  }
}