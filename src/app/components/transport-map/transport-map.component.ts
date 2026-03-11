import { Component, Input, Output, EventEmitter, ViewChild, ViewChildren, QueryList, OnChanges, SimpleChanges } from '@angular/core';
import { GoogleMapsModule, MapInfoWindow, MapMarker } from '@angular/google-maps';
import { VehiclePosition } from '../../models/vehicle.model';
import { Stop } from '../../models/stop.model';
import { UserLocation } from '../../services/location.service';
import { CommonModule } from '@angular/common';

// Define marker interfaces
interface MapMarkerData {
  position: google.maps.LatLngLiteral;
  title: string;
  options: google.maps.MarkerOptions;
  data: any;
  id: string; // Add unique ID for tracking
}

@Component({
  selector: 'app-transport-map',
  templateUrl: './transport-map.component.html',
  imports: [CommonModule, GoogleMapsModule]
})
export class TransportMapComponent implements OnChanges {
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;
  @ViewChildren(MapMarker) mapMarkers!: QueryList<MapMarker>;
  
  @Input() vehicles: VehiclePosition[] = [];
  @Input() stops: Stop[] = [];
  @Input() userLocation: UserLocation | null = null;
  @Input() center: google.maps.LatLngLiteral = { lat: 3.139, lng: 101.6869 };
  @Input() zoom = 12;
  
  @Output() centerChange = new EventEmitter<google.maps.LatLngLiteral>();
  @Output() markerClick = new EventEmitter<any>();

  // Map options
  options: google.maps.MapOptions = {
    mapTypeId: 'roadmap',
    zoomControl: true,
    scrollwheel: true,
    disableDoubleClickZoom: true,
    fullscreenControl: true,
    streetViewControl: false,
    mapTypeControl: false,
  };

  // Markers - using simple objects for template binding
  vehicleMarkers: MapMarkerData[] = [];
  stopMarkers: MapMarkerData[] = [];
  userMarker: MapMarkerData | null = null;
  
  selectedInfo = '';
  selectedMarker: any = null;

  // Map to store marker references by ID
  private markerRefs: Map<string, MapMarker> = new Map();

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
  }

  // After view initializes, we can access the markers
  ngAfterViewInit() {
    this.updateMarkerRefs();
  }

  ngAfterViewChecked() {
    this.updateMarkerRefs();
  }

  private updateMarkerRefs() {
    if (this.mapMarkers) {
      this.mapMarkers.forEach((marker, index) => {
        // Store markers by index or some unique identifier
        this.markerRefs.set(`marker-${index}`, marker);
      });
    }
  }

  updateVehicleMarkers() {
    this.vehicleMarkers = this.vehicles.map((vehicle, index) => ({
      id: `vehicle-${vehicle.vehicle_id}-${index}`,
      position: { lat: vehicle.lat, lng: vehicle.lon },
      title: `${vehicle.route_id} - ${vehicle.vehicle_id}`,
      options: {
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          rotation: vehicle.bearing,
          scale: 5,
          fillColor: this.getVehicleColor(vehicle),
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: '#FFFFFF'
        },
        animation: google.maps.Animation.DROP as any,
        zIndex: 100
      },
      data: vehicle
    }));
  }

  updateStopMarkers() {
    this.stopMarkers = this.stops.map((stop, index) => ({
      id: `stop-${stop.stop_id}-${index}`,
      position: { lat: stop.stop_lat, lng: stop.stop_lon },
      title: stop.stop_name,
      options: {
        icon: {
          url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
        },
        zIndex: 50
      },
      data: stop
    }));
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

  getVehicleColor(vehicle: VehiclePosition): string {
    if (vehicle.speed > 0) {
      return '#4CAF50'; // Green for moving
    }
    return '#FF9800'; // Orange for stopped
  }

  onMapClick() {
    if (this.infoWindow) {
      this.infoWindow.close();
    }
  }

  // Handle marker click with the marker ID
  onMarkerClick(markerId: string) {
    const markerRef = this.markerRefs.get(markerId);
    if (!markerRef) return;

    // Find the marker data
    let markerData: MapMarkerData | undefined;
    
    if (this.userMarker && this.userMarker.id === markerId) {
      markerData = this.userMarker;
    } else {
      markerData = [...this.vehicleMarkers, ...this.stopMarkers].find(m => m.id === markerId);
    }

    if (!markerData) return;

    const data = markerData.data;
    this.selectedMarker = data;
    
    if (data.route_id) {
      // Vehicle marker
      this.selectedInfo = `
        <div class="p-3">
          <strong class="text-lg">${data.route_id}</strong><br>
          <span class="text-sm">Vehicle: ${data.vehicle_id}</span><br>
          <span class="text-sm">Speed: ${data.speed} km/h</span><br>
          <span class="text-sm">Bearing: ${data.bearing}°</span><br>
          <span class="text-xs text-gray-500">${new Date(data.observed_at).toLocaleTimeString()}</span>
        </div>
      `;
    } else if (data.stop_name) {
      // Stop marker
      this.selectedInfo = `
        <div class="p-3">
          <strong>${data.stop_name}</strong><br>
          <span class="text-sm">Stop ID: ${data.stop_id}</span><br>
          <span class="text-xs text-gray-500">Lat: ${data.stop_lat.toFixed(4)}, Lng: ${data.stop_lon.toFixed(4)}</span>
        </div>
      `;
    } else if (data.type === 'user') {
      this.selectedInfo = `
        <div class="p-3">
          <strong>Your Location</strong><br>
          <span class="text-xs text-gray-500">Lat: ${data.location.lat.toFixed(4)}, Lng: ${data.location.lng.toFixed(4)}</span>
        </div>
      `;
    }
    
    this.markerClick.emit(data);
    this.infoWindow.open(markerRef);
  }

  onMapCenterChange() {
    // The center is handled by the google-map component
  }

  // Helper to track markers by id
  trackByMarkerId(index: number, marker: MapMarkerData): string {
    return marker.id;
  }
}