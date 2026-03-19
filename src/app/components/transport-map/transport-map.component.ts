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
  type: 'vehicle' | 'stop' | 'user';
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
  selectedMarkerData: MapMarkerData | null = null;
  geofenceCenter: google.maps.LatLngLiteral | null = null;

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
  selectedMarker: any = null;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['vehicles']) {
      this.updateVehicleMarkers();
    }

    if (changes['stops']) {
      this.updateStopMarkers();
    }

    if (changes['userLocation']) {
      this.updateUserMarker();

      if (this.map && this.geofenceCenter) {
        this.fitMapToGeofence();
      }
    }

    if (changes['center'] && this.map) {
      if (changes['center'].currentValue !== changes['center'].previousValue) {
        this.panToLocation(this.center);
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
        if (!this.map || !this.geofenceCenter || this.pulseCircleRefs.length === 0) {
          this.pulseAnimationId = requestAnimationFrame(animate);
          return;
        }

        const baseRadius = 2000;
        const extraRadius = 1000;
        const duration = 2000;

        this.pulseCircleRefs.forEach((circle, i) => {
          const offset = i * (duration / 3);
          const progress = ((time + offset) % duration) / duration;

          circle.setCenter(this.geofenceCenter);
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
    if (!this.map || !this.geofenceCenter) return;

    this.clearPulseCircles();

    this.pulseCircleRefs = [0, 1, 2].map(() => {
      const circle = new google.maps.Circle({
        map: this.map!,
        center: this.geofenceCenter,
        radius: 2000,
        clickable: false,
        strokeColor: '#2196F3',
        strokeOpacity: 0.25,
        strokeWeight: 2,
        fillColor: '#2196F3',
        fillOpacity: 0.06,
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

    if (this.geofenceCenter) {
      this.initPulseCircles();
    }

    if (this.pulseAnimationId === null) {
      this.startPulse();
    }
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
    if (this.map && this.geofenceCenter) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(this.geofenceCenter);

      const latOffset = 0.18;
      const lngOffset = 0.18 / Math.cos(this.geofenceCenter.lat * Math.PI / 180);

      bounds.extend({ lat: this.geofenceCenter.lat + latOffset, lng: this.geofenceCenter.lng + lngOffset });
      bounds.extend({ lat: this.geofenceCenter.lat - latOffset, lng: this.geofenceCenter.lng - lngOffset });
      bounds.extend({ lat: this.geofenceCenter.lat + latOffset, lng: this.geofenceCenter.lng - lngOffset });
      bounds.extend({ lat: this.geofenceCenter.lat - latOffset, lng: this.geofenceCenter.lng + lngOffset });

      this.map.fitBounds(bounds);
    }
  }

  updateStopMarkers() {
    const stationIconSvg = '/icons/gps.svg';

    this.stopMarkers = this.stops.map((stop, index) => ({
      id: `stop-${stop.stop_id}-${index}`,
      type: 'stop',
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

    setTimeout(() => this.setupClustering(), 500);
  }

  updateUserMarker() {
    if (this.userLocation) {
      const userPos = { lat: this.userLocation.lat, lng: this.userLocation.lng };

      this.userMarker = {
        id: 'user-location',
        type: 'user',
        position: userPos,
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

      this.geofenceCenter = userPos;

      if (this.map) {
        this.initPulseCircles();
      }
    } else {
      this.userMarker = null;
      this.geofenceCenter = null;
      this.clearPulseCircles();
    }
  }

  onMapClick() {
    if (this.infoWindow) {
      this.infoWindow.close();
    }
  }

  onMarkerClick(markerRef: MapMarker, markerData: MapMarkerData) {
    this.selectedMarkerData = markerData;
    this.selectedMarker = markerData.data;
    this.markerClick.emit(markerData.data);
    setTimeout(() => { this.infoWindow.open(markerRef); }, 50);
  }

  getBearingDirection(bearing: number): string {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(bearing / 22.5) % 16;
    return directions[index];
  }

  getTimeAgo(timestamp: string): string {
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

  agencyColor(agency: string, category?: string | null): string {
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
      const color = this.agencyColor(vehicle.feed_agency, vehicle.feed_category);

      return {
        id: `vehicle-${vehicle.vehicle_id}-${index}`,
        type: 'vehicle',
        position: { lat: vehicle.lat, lng: vehicle.lon },
        title: `${vehicle.route_id || 'No Route'} - ${vehicle.vehicle_id}`,
        options: {
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            rotation: vehicle.bearing,
            scale: 6,
            fillColor: color,
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: '#FFFFFF',
            anchor: new google.maps.Point(0, 3)
          },
          zIndex: 100
        },
        data: vehicle
      };
    });

    setTimeout(() => this.setupClustering(), 500);
  }

  onMapCenterChange() {
    // The center is handled by the google-map component
  }

  trackByMarkerId(index: number, marker: MapMarkerData): string {
    return marker.id;
  }
}