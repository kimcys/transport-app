import { Component, Input } from '@angular/core';
import { VehiclePosition } from '../../models/vehicle.model';
import { Route } from '../../models/route.model';
import { NearestTransport } from '../../models/trip.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stats-cards',
  templateUrl: './stats-cards.component.html',
  imports: [CommonModule]
})
export class StatsCardsComponent {
  @Input() vehicles: VehiclePosition[] = [];
  @Input() routes: Route[] = [];
  @Input() nearestTransports: NearestTransport[] = [];
  @Input() selectedAgency: string = '';
  @Input() lastUpdated: Date = new Date();

  // Get unique route IDs
  getUniqueRoutes(): number {
    const uniqueRouteIds = new Set(this.routes.map(r => r.route_id));
    return uniqueRouteIds.size;
  }

  // Get maximum distance of nearest transports
  getMaxDistance(): string {
    if (this.nearestTransports.length === 0) return '0';
    const maxDistance = Math.max(...this.nearestTransports.map(t => t.distance));
    return maxDistance.toFixed(1);
  }

  // Get agency status
  getAgencyStatus(): string {
    if (!this.selectedAgency) return 'Not selected';
    if (this.vehicles.length > 0) return `${this.vehicles.length} active vehicles`;
    if (this.routes.length > 0) return `${this.routes.length} routes available`;
    return 'Selected';
  }
}