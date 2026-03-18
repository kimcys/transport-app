// transport-map.component.ts
import {
  Component, Input, Output, EventEmitter, ViewChild, ViewChildren, QueryList, OnChanges, SimpleChanges, AfterViewInit, ElementRef, AfterViewChecked, OnDestroy,
  NgZone,
  ChangeDetectionStrategy
} from '@angular/core';
import { GoogleMapsModule, MapInfoWindow, MapMarker } from '@angular/google-maps';
import { VehiclePosition } from '../../models/vehicle.model';
import { Stop } from '../../models/stop.model';
import { UserLocation } from '../../services/location.service';
import { CommonModule } from '@angular/common';
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer';

interface MapMarkerData {
  position: google.maps.LatLngLiteral;
  title: string;
  options: google.maps.MarkerOptions;
  data: any;
  id: string;
}

@Component({
  selector: 'app-transport-map',
  templateUrl: './transport-map.component.html',
  styleUrl: './transport-map.component.css',
  imports: [CommonModule, GoogleMapsModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransportMapComponent implements OnChanges, AfterViewInit, OnDestroy {
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;
  @ViewChildren(MapMarker) mapMarkers!: QueryList<MapMarker>;
  @ViewChild('mapContainer') mapContainer!: ElementRef;

  @Input() vehicles: VehiclePosition[] = [];
  @Input() stops: Stop[] = [];
  @Input() userLocation: UserLocation | null = null;
  @Input() center: google.maps.LatLngLiteral = { lat: 3.139, lng: 101.6869 };
  @Input() zoom = 12;

  @Output() centerChange = new EventEmitter<google.maps.LatLngLiteral>();
  @Output() markerClick = new EventEmitter<any>();

  private map: google.maps.Map | null = null;
  private vehicleClusterer: MarkerClusterer | null = null;
  private stopClusterer: MarkerClusterer | null = null;
  private vehicleMarkerRefs: google.maps.Marker[] = [];
  private stopMarkerRefs: google.maps.Marker[] = [];
  private pulseCircleRefs: google.maps.Circle[] = [];
  private pulseAnimationId: number | null = null;

  constructor(private ngZone: NgZone) { }

  options: google.maps.MapOptions = {
    mapTypeId: 'roadmap',
    zoomControl: true,
    scrollwheel: true,
    disableDoubleClickZoom: true,
    fullscreenControl: true,
    streetViewControl: false,
    mapTypeControl: false,
    styles: [
      {
        featureType: 'poi',
        elementType: 'labels',
        stylers: [{ visibility: 'off' }]
      }
    ]
  };

  geofenceOptions: google.maps.CircleOptions = {
    strokeColor: '#2196F3',
    strokeOpacity: 0.3,
    strokeWeight: 2,
    strokePosition: google.maps.StrokePosition.CENTER,
    fillColor: '#2196F3',
    fillOpacity: 0.02,
    clickable: false,
    editable: false,
    draggable: false,
    zIndex: 1
  };

  vehicleMarkers: MapMarkerData[] = [];
  stopMarkers: MapMarkerData[] = [];
  userMarker: MapMarkerData | null = null;

  selectedInfo = '';
  selectedMarker: any = null;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['vehicles']) {
      this.updateVehicleMarkers();
    }
    if (changes['stops']) {
      this.updateStopMarkers();
    }
    if (changes['userLocation'] && this.userLocation) {
      this.updateUserMarker();
    }
    if (changes['center'] && this.map) {
      if (changes['center'].currentValue !== changes['center'].previousValue) {
        this.panToLocation(this.center);

        this.pulseCircleRefs.forEach(circle => {
          circle.setCenter(this.center);
        });
      }
    }
  }

  ngAfterViewInit() {
    this.mapMarkers.changes.subscribe(() => {
      this.attachMarkerData();
      this.setupClustering();
    });

    setTimeout(() => {
      this.attachMarkerData();
      this.setupClustering();
    }, 1000);
  }

  private attachMarkerData() {
    this.mapMarkers.forEach((marker, index) => {
      if (index < this.vehicleMarkers.length) {
        (marker as any).markerData = this.vehicleMarkers[index];
      } else if (index < this.vehicleMarkers.length + this.stopMarkers.length) {
        const stopIndex = index - this.vehicleMarkers.length;
        (marker as any).markerData = this.stopMarkers[stopIndex];
      } else if (this.userMarker && index === this.vehicleMarkers.length + this.stopMarkers.length) {
        (marker as any).markerData = this.userMarker;
      }
    });
  }

  private startPulse() {
    if (!this.map) return;

    this.ngZone.runOutsideAngular(() => {
      const animate = (time: number) => {
        if (!this.map || !this.center || this.pulseCircleRefs.length === 0) {
          this.pulseAnimationId = requestAnimationFrame(animate);
          return;
        }

        const baseRadius = 20000;
        const extraRadius = 10000;
        const duration = 2000;

        this.pulseCircleRefs.forEach((circle, i) => {
          const offset = i * (duration / 3);
          const progress = ((time + offset) % duration) / duration;

          circle.setCenter(this.center);
          circle.setRadius(baseRadius + progress * extraRadius);
          circle.setOptions({
            fillOpacity: 0.12 * (1 - progress),
            strokeOpacity: 0.28 * (1 - progress)
          });
        });

        this.pulseAnimationId = requestAnimationFrame(animate);
      };

      this.pulseAnimationId = requestAnimationFrame(animate);
    });
  }

  private initPulseCircles() {
    if (!this.map || !this.center) return;

    this.clearPulseCircles();

    this.pulseCircleRefs = [0, 1, 2].map(() => {
      const circle = new google.maps.Circle({
        map: this.map!,
        center: this.center,
        radius: 20000,
        clickable: false,
        strokeColor: '#2196F3',
        strokeOpacity: 0.3,
        strokeWeight: 2,
        fillColor: '#2196F3',
        fillOpacity: 0.08,
        zIndex: 2
      });

      return circle;
    });
  }

  private clearPulseCircles() {
    this.pulseCircleRefs.forEach(circle => circle.setMap(null));
    this.pulseCircleRefs = [];
  }

  ngOnDestroy() {
    if (this.pulseAnimationId !== null) {
      cancelAnimationFrame(this.pulseAnimationId);
      this.pulseAnimationId = null;
    }

    this.clearPulseCircles();
  }

  onMapInit(map: google.maps.Map) {
    this.map = map;
    this.fitMapToGeofence();
    this.initPulseCircles();
    this.startPulse();
  }

  private setupClustering() {
    if (!this.map) return;

    // Clear existing clusterers
    if (this.vehicleClusterer) {
      this.vehicleClusterer.clearMarkers();
    }
    if (this.stopClusterer) {
      this.stopClusterer.clearMarkers();
    }

    // Get native Google Maps markers from the template
    setTimeout(() => {
      const nativeMarkers = this.mapMarkers.map(marker => marker.marker).filter(m => m !== undefined);

      // Separate vehicle and stop markers
      this.vehicleMarkerRefs = nativeMarkers.filter((marker, index) =>
        index < this.vehicleMarkers.length && marker !== undefined
      ) as google.maps.Marker[];

      this.stopMarkerRefs = nativeMarkers.filter((marker, index) =>
        index >= this.vehicleMarkers.length &&
        index < this.vehicleMarkers.length + this.stopMarkers.length &&
        marker !== undefined
      ) as google.maps.Marker[];

      // Create vehicle clusterer
      if (this.vehicleMarkerRefs.length > 0) {
        this.vehicleClusterer = new MarkerClusterer({
          map: this.map,
          markers: this.vehicleMarkerRefs,
          algorithm: new SuperClusterAlgorithm({
            radius: 50,
            minPoints: 3,
            maxZoom: 16
          })
        });
      }

      // Create stop clusterer
      if (this.stopMarkerRefs.length > 0) {
        this.stopClusterer = new MarkerClusterer({
          map: this.map,
          markers: this.stopMarkerRefs,
          algorithm: new SuperClusterAlgorithm({
            radius: 40,
            minPoints: 5,
            maxZoom: 15
          })
        });
      }
    }, 500);
  }

  private panToLocation(location: google.maps.LatLngLiteral) {
    if (this.map) {
      this.map.panTo(location);
      this.map.setZoom(15); // Zoom in to show details
    }
  }

  private fitMapToGeofence() {
    if (this.map && this.center) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(this.center);

      const latOffset = 0.18;
      const lngOffset = 0.18 / Math.cos(this.center.lat * Math.PI / 180);

      bounds.extend({ lat: this.center.lat + latOffset, lng: this.center.lng + lngOffset });
      bounds.extend({ lat: this.center.lat - latOffset, lng: this.center.lng - lngOffset });
      bounds.extend({ lat: this.center.lat + latOffset, lng: this.center.lng - lngOffset });
      bounds.extend({ lat: this.center.lat - latOffset, lng: this.center.lng + lngOffset });

      this.map.fitBounds(bounds);
    }
  }

  updateStopMarkers() {
    const stationIconSvg = '/icons/gps.svg';

    this.stopMarkers = this.stops.map((stop, index) => ({
      id: `stop-${stop.stop_id}-${index}`,
      position: { lat: stop.stop_lat, lng: stop.stop_lon },
      title: stop.stop_name,
      options: {
        icon: {
          url: stationIconSvg,
          scaledSize: new google.maps.Size(24, 24),
          anchor: new google.maps.Point(12, 12)
        },
        zIndex: 50
      },
      data: stop
    }));

    // Re-setup clustering after markers update
    setTimeout(() => this.setupClustering(), 500);
  }

  updateUserMarker() {
    if (this.userLocation) {
      this.userMarker = {
        id: 'user-location',
        position: { lat: this.userLocation.lat, lng: this.userLocation.lng },
        title: 'You are here',
        options: {
          icon: {
            url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
            scaledSize: new google.maps.Size(40, 40)
          },
          zIndex: 200
        },
        data: { type: 'user', location: this.userLocation }
      };
    } else {
      this.userMarker = null;
    }
  }

  onMapClick() {
    if (this.infoWindow) {
      this.infoWindow.close();
    }
  }

  // transport-map.component.ts - Update the onMarkerClick method

  onMarkerClick(markerRef: MapMarker, markerData: MapMarkerData) {
    const data = markerData.data;
    this.selectedMarker = data;

    if (data.route_id) {
      const speedClass = data.speed === 0 ? 'text-amber-600' : 'text-emerald-600';
      const speedIcon = data.speed === 0 ? '●' : '▶';
      const isMoving = data.speed > 0;

      // Simplify the HTML string - remove template literals that might cause issues
      this.selectedInfo = `
      <div style="padding: 12px; min-width: 240px; font-family: system-ui, -apple-system, sans-serif;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="background: #e6f0ff; padding: 4px 8px; border-radius: 6px; font-weight: bold; color: #2563eb;">${data.route_id}</span>
          <span style="color: #6b7280; font-size: 12px;">${data.vehicle_id}</span>
        </div>
        <div style="display: flex; gap: 12px; margin-bottom: 8px;">
          <div>
            <div style="color: #9ca3af; font-size: 11px;">Speed</div>
            <div style="font-weight: 600; color: ${data.speed === 0 ? '#d97706' : '#10b981'};">${data.speed} km/h</div>
          </div>
          <div>
            <div style="color: #9ca3af; font-size: 11px;">Direction</div>
            <div style="font-weight: 600; color: #374151;">${this.getBearingDirection(data.bearing)} (${data.bearing}°)</div>
          </div>
        </div>
        <div style="border-top: 1px solid #f3f4f6; padding-top: 6px; font-size: 11px; color: #9ca3af;">
          <span>📍 ${data.lat.toFixed(4)}, ${data.lon.toFixed(4)}</span>
        </div>
        <div style="font-size: 10px; color: #d1d5db; margin-top: 4px;">
          Updated ${this.getTimeAgo(data.observed_at)}
        </div>
      </div>
    `;
    } else if (data.stop_name) {
      this.selectedInfo = `
      <div style="padding: 12px; min-width: 200px; font-family: system-ui, -apple-system, sans-serif;">
        <div style="font-weight: 500; color: #6b7280; font-size: 12px; margin-bottom: 2px;">Stop</div>
        <div style="font-weight: 600; color: #111827; font-size: 14px; margin-bottom: 8px;">${data.stop_name}</div>
        <div style="border-top: 1px solid #f3f4f6; padding-top: 6px; font-size: 11px; color: #6b7280;">
          <div>ID: ${data.stop_id}</div>
          <div>📍 ${data.stop_lat.toFixed(4)}, ${data.stop_lon.toFixed(4)}</div>
        </div>
      </div>
    `;
    } else if (data.type === 'user') {
      this.selectedInfo = `
      <div style="padding: 12px; min-width: 180px; font-family: system-ui, -apple-system, sans-serif;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-size: 20px;">👤</span>
          <div>
            <div style="font-weight: 500; color: #6b7280; font-size: 12px;">Your Location</div>
            <div style="font-weight: 600; color: #111827;">You are here</div>
          </div>
        </div>
        <div style="border-top: 1px solid #f3f4f6; padding-top: 6px; font-size: 11px; color: #6b7280;">
          <div>${data.location.lat.toFixed(6)}</div>
          <div>${data.location.lng.toFixed(6)}</div>
        </div>
      </div>
    `;
    }

    this.markerClick.emit(data);

    // Add a small delay to ensure the info window content is set
    setTimeout(() => {
      this.infoWindow.open(markerRef);
    }, 50);
  }

  private getBearingDirection(bearing: number): string {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(bearing / 22.5) % 16;
    return directions[index];
  }

  private getTimeAgo(timestamp: string): string {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins === 1) return '1 min ago';
    if (diffMins < 60) return `${diffMins} mins ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;

    return past.toLocaleDateString();
  }

  private agencyColor(agency: string, category?: string | null): string {
    agency = agency?.toLowerCase() ?? '';
    category = category?.toLowerCase() ?? '';

    if (agency === 'ktmb') {
      return '#0033A0';
    }
    if (agency.startsWith('mybas')) {
      return '#6A1B9A';
    }
    if (agency === 'prasarana') {
      if (category === 'rapid-bus-kl') return '#D32F2F';
      if (category === 'rapid-bus-penang') return '#00897B';
      if (category === 'rapid-bus-kuantan') return '#F57C00';
      if (category === 'rapid-bus-mrtfeeder') return '#7B1FA2';
      if (category === 'rapid-rail-kl') return '#C2185B';
    }
    return '#455A64';
  }

  updateVehicleMarkers() {
    this.vehicleMarkers = this.vehicles.map((vehicle, index) => {
      const color = this.agencyColor(
        vehicle.feed_agency,
        vehicle.feed_category
      );

      return {
        id: `vehicle-${vehicle.vehicle_id}-${index}`,
        position: { lat: vehicle.lat, lng: vehicle.lon },
        title: `${vehicle.route_id} - ${vehicle.vehicle_id}`,
        options: {
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            rotation: vehicle.bearing,
            scale: 5,
            fillColor: color,
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: '#FFFFFF'
          },
          zIndex: 100
        },
        data: vehicle
      };
    });

    // Re-setup clustering after markers update
    setTimeout(() => this.setupClustering(), 500);
  }

  onMapCenterChange() {
    // The center is handled by the google-map component
  }

  trackByMarkerId(index: number, marker: MapMarkerData): string {
    return marker.id;
  }
}