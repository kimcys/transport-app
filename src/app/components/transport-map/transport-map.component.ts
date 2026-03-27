import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ViewChildren,
  QueryList,
  OnChanges,
  SimpleChanges,
  AfterViewInit,
  ElementRef,
  OnDestroy,
  NgZone,
  ChangeDetectionStrategy
} from '@angular/core';
import { GoogleMapsModule, MapInfoWindow, MapMarker } from '@angular/google-maps';
import { VehiclePosition } from '../../models/vehicle.model';
import { Stop } from '../../models/stop.model';
import { UserLocation } from '../../services/location.service';
import { CommonModule } from '@angular/common';
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer';
import { JourneyOption } from '../../models/trip.model';

interface MapMarkerData {
  position: google.maps.LatLngLiteral;
  title: string;
  options: google.maps.MarkerOptions;
  data: any;
  id: string;
  type: 'vehicle' | 'stop' | 'user' | 'journey';
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
  @Input() journey: JourneyOption | null = null;
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
  private clusteringTimeout: ReturnType<typeof setTimeout> | null = null;

  selectedMarkerData: MapMarkerData | null = null;
  selectedMarker: any = null;
  geofenceCenter: google.maps.LatLngLiteral | null = null;

  vehicleMarkers: MapMarkerData[] = [];
  stopMarkers: MapMarkerData[] = [];
  userMarker: MapMarkerData | null = null;
  journeyMarkerData: MapMarkerData[] = [];
  journeyPolylines: Array<{
    id: string;
    path: google.maps.LatLngLiteral[];
    options: google.maps.PolylineOptions;
  }> = [];

  constructor(private ngZone: NgZone) {}

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

  ngOnChanges(changes: SimpleChanges) {
    if (changes['vehicles']) {
      this.updateVehicleMarkers();
    }

    if (changes['stops']) {
      this.updateStopMarkers();
    }

    if (changes['userLocation']) {
      this.updateUserMarker();

      if (this.map && this.geofenceCenter && !this.journey) {
        this.fitMapToGeofence();
      }
    }

    if (changes['journey']) {
      this.updateJourneyOverlay();
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
      this.scheduleClustering();
    });

    setTimeout(() => {
      this.attachMarkerData();
      this.scheduleClustering();
    }, 300);
  }

  ngOnDestroy() {
    if (this.pulseAnimationId !== null) {
      cancelAnimationFrame(this.pulseAnimationId);
      this.pulseAnimationId = null;
    }

    if (this.clusteringTimeout) {
      clearTimeout(this.clusteringTimeout);
      this.clusteringTimeout = null;
    }

    this.clearPulseCircles();
    this.clearMapSelection();
    this.clearVehicleMarkers();
    this.clearStopMarkers();
  }

  onMapInit(map: google.maps.Map) {
    this.map = map;

    this.fitMapToGeofence();
    this.fitMapToJourney();

    if (this.geofenceCenter) {
      this.initPulseCircles();
    }

    if (this.pulseAnimationId === null) {
      this.startPulse();
    }

    this.scheduleClustering();
  }

  onMapClick() {
    this.clearMapSelection();
  }

  onMarkerClick(markerRef: MapMarker, markerData: MapMarkerData) {
    this.selectedMarkerData = markerData;
    this.selectedMarker = markerData.data;
    this.markerClick.emit(markerData.data);

    setTimeout(() => {
      this.infoWindow?.open(markerRef);
    }, 50);
  }

  onMapCenterChange() {
    // The center is handled by the google-map component
  }

  trackByMarkerId(index: number, marker: MapMarkerData): string {
    return marker.id;
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

  private scheduleClustering() {
    if (this.clusteringTimeout) {
      clearTimeout(this.clusteringTimeout);
    }

    this.clusteringTimeout = setTimeout(() => {
      this.setupClustering();
      this.clusteringTimeout = null;
    }, 300);
  }

  private setupClustering() {
    if (!this.map) return;

    if (this.vehicleClusterer) {
      this.vehicleClusterer.clearMarkers();
      this.vehicleClusterer = null;
    }

    if (this.stopClusterer) {
      this.stopClusterer.clearMarkers();
      this.stopClusterer = null;
    }

    if (this.vehicleMarkers.length === 0 && this.stopMarkers.length === 0) {
      this.vehicleMarkerRefs = [];
      this.stopMarkerRefs = [];
      return;
    }

    const nativeMarkers = this.mapMarkers
      .map(marker => marker.marker)
      .filter((m): m is google.maps.Marker => !!m);

    this.vehicleMarkerRefs = nativeMarkers.filter((marker, index) =>
      index < this.vehicleMarkers.length
    );

    this.stopMarkerRefs = nativeMarkers.filter((marker, index) =>
      index >= this.vehicleMarkers.length &&
      index < this.vehicleMarkers.length + this.stopMarkers.length
    );

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
  }

  private clearMapSelection() {
    this.selectedMarker = null;
    this.selectedMarkerData = null;
    this.infoWindow?.close();
  }

  private clearVehicleMarkers() {
    if (this.vehicleClusterer) {
      this.vehicleClusterer.clearMarkers();
      this.vehicleClusterer = null;
    }

    this.vehicleMarkerRefs.forEach(marker => marker.setMap(null));
    this.vehicleMarkerRefs = [];
    this.vehicleMarkers = [];
  }

  private clearStopMarkers() {
    if (this.stopClusterer) {
      this.stopClusterer.clearMarkers();
      this.stopClusterer = null;
    }

    this.stopMarkerRefs.forEach(marker => marker.setMap(null));
    this.stopMarkerRefs = [];
    this.stopMarkers = [];
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
      return new google.maps.Circle({
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
    });
  }

  private clearPulseCircles() {
    this.pulseCircleRefs.forEach(circle => circle.setMap(null));
    this.pulseCircleRefs = [];
  }

  private panToLocation(location: google.maps.LatLngLiteral) {
    if (this.map) {
      this.map.panTo(location);
      this.map.setZoom(15);
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

  private fitMapToJourney() {
    if (!this.map || !this.journey) {
      return;
    }

    const bounds = new google.maps.LatLngBounds();

    this.journey.mapSegments.forEach(segment => {
      segment.path.forEach(point => bounds.extend(point));
    });

    this.journey.mapMarkers.forEach(marker => bounds.extend(marker.position));

    if (!bounds.isEmpty()) {
      this.map.fitBounds(bounds, 64);
    }
  }

  updateStopMarkers() {
    this.clearMapSelection();
    this.clearStopMarkers();

    if (!this.stops || this.stops.length === 0) {
      return;
    }

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

    this.scheduleClustering();
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

  private updateJourneyOverlay() {
    if (!this.journey) {
      this.journeyMarkerData = [];
      this.journeyPolylines = [];
      return;
    }

    this.journeyMarkerData = this.journey.mapMarkers.map(marker => ({
      id: `journey-${marker.id}`,
      type: 'journey',
      position: marker.position,
      title: marker.label,
      options: {
        label: {
          text: marker.label,
          color: '#ffffff',
          fontWeight: '700'
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: marker.kind === 'transfer' ? 11 : 9,
          fillColor:
            marker.kind === 'start'
              ? '#059669'
              : marker.kind === 'end'
                ? '#dc2626'
                : '#d97706',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        },
        zIndex: 250
      },
      data: marker
    }));

    this.journeyPolylines = this.journey.mapSegments.map((segment, index) => ({
      id: `polyline-${index}`,
      path: segment.path,
      options: {
        clickable: false,
        geodesic: true,
        strokeColor: segment.kind === 'walk' ? '#2563eb' : '#d97706',
        strokeOpacity: segment.kind === 'walk' ? 0 : 0.9,
        strokeWeight: segment.kind === 'walk' ? 2 : 5,
        icons: segment.kind === 'walk'
          ? [{
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 1,
                scale: 3
              },
              offset: '0',
              repeat: '12px'
            }]
          : undefined
      }
    }));

    setTimeout(() => this.fitMapToJourney(), 150);
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

  private vehicleIconType(
    agency: string,
    category?: string | null
  ): 'bus' | 'feeder' | 'rail' | 'train' {
    const normalizedAgency = agency?.toLowerCase() ?? '';
    const normalizedCategory = category?.toLowerCase() ?? '';

    if (normalizedAgency === 'ktmb') {
      return 'train';
    }

    if (
      normalizedCategory.includes('rail') ||
      normalizedCategory.includes('mrt') ||
      normalizedCategory.includes('lrt') ||
      normalizedCategory.includes('monorail')
    ) {
      return 'rail';
    }

    if (normalizedCategory.includes('feeder')) {
      return 'feeder';
    }

    return 'bus';
  }

  private vehicleIconSvg(
    type: 'bus' | 'feeder' | 'rail' | 'train',
    color: string
  ): string {
    const busBody = `<rect x="12" y="14" width="24" height="16" rx="5" fill="${color}" /><rect x="16" y="18" width="16" height="6" rx="2" fill="white" opacity="0.95" /><circle cx="18" cy="32" r="3" fill="#1f2937" /><circle cx="30" cy="32" r="3" fill="#1f2937" />`;
    const feederBody = `<rect x="11" y="13" width="26" height="18" rx="8" fill="${color}" /><rect x="16" y="18" width="16" height="6" rx="3" fill="white" opacity="0.95" /><circle cx="18" cy="32" r="3" fill="#1f2937" /><circle cx="30" cy="32" r="3" fill="#1f2937" /><path d="M24 8l2 4h-4l2-4z" fill="${color}" />`;
    const railBody = `<rect x="11" y="11" width="26" height="22" rx="8" fill="${color}" /><rect x="16" y="16" width="16" height="8" rx="3" fill="white" opacity="0.95" /><path d="M17 34h14" stroke="#1f2937" stroke-width="2" stroke-linecap="round" /><path d="M20 37l-2 3M28 37l2 3" stroke="#1f2937" stroke-width="2" stroke-linecap="round" />`;
    const trainBody = `<rect x="10" y="10" width="28" height="24" rx="6" fill="${color}" /><rect x="15" y="15" width="18" height="8" rx="2" fill="white" opacity="0.95" /><path d="M18 34h12" stroke="#1f2937" stroke-width="2" stroke-linecap="round" /><path d="M19 37l-2 3M29 37l2 3" stroke="#1f2937" stroke-width="2" stroke-linecap="round" /><path d="M24 6v6" stroke="${color}" stroke-width="3" stroke-linecap="round" />`;

    const body = {
      bus: busBody,
      feeder: feederBody,
      rail: railBody,
      train: trainBody
    }[type];

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="20" fill="white" opacity="0.96"/>
        <circle cx="24" cy="24" r="19" fill="none" stroke="${color}" stroke-width="2"/>
        ${body}
      </svg>
    `)}`;
  }

  updateVehicleMarkers() {
    this.clearMapSelection();
    this.clearVehicleMarkers();

    if (!this.vehicles || this.vehicles.length === 0) {
      return;
    }

    this.vehicleMarkers = this.vehicles.map((vehicle, index) => {
      const color = this.agencyColor(vehicle.feed_agency, vehicle.feed_category);
      const iconType = this.vehicleIconType(vehicle.feed_agency, vehicle.feed_category);

      return {
        id: `vehicle-${vehicle.vehicle_id}-${index}`,
        type: 'vehicle',
        position: { lat: vehicle.lat, lng: vehicle.lon },
        title: `${vehicle.route_id || 'No Route'} - ${vehicle.vehicle_id}`,
        options: {
          icon: {
            url: this.vehicleIconSvg(iconType, color),
            scaledSize: new google.maps.Size(34, 34),
            anchor: new google.maps.Point(17, 17)
          },
          zIndex: 100
        },
        data: vehicle
      };
    });

    this.scheduleClustering();
  }
}