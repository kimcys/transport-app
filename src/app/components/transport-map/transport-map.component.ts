// transport-map.component.ts
import { Component, Input, Output, EventEmitter, ViewChild, ViewChildren, QueryList, OnChanges, SimpleChanges, AfterViewInit, ElementRef } from '@angular/core';
import { GoogleMapsModule, MapInfoWindow, MapMarker } from '@angular/google-maps';
import { VehiclePosition } from '../../models/vehicle.model';
import { Stop } from '../../models/stop.model';
import { UserLocation } from '../../services/location.service';
import { CommonModule } from '@angular/common';
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer';

// Define marker interfaces
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
  imports: [CommonModule, GoogleMapsModule]  // Remove GoogleMapsMarkerClustererModule
})
export class TransportMapComponent implements OnChanges, AfterViewInit {
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
  private googleMarkers: google.maps.Marker[] = [];

  // Map options
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

  // Geofence options
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

  // Markers
  vehicleMarkers: MapMarkerData[] = [];
  stopMarkers: MapMarkerData[] = [];
  userMarker: MapMarkerData | null = null;

  selectedInfo = '';
  selectedMarker: any = null;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['vehicles']) {
      this.updateVehicleMarkers();
      this.updateVehicleClusters();
    }
    if (changes['stops']) {
      this.updateStopMarkers();
      this.updateStopClusters();
    }
    if (changes['userLocation'] && this.userLocation) {
      this.updateUserMarker();
    }
    if (changes['center'] && this.map) {
      this.fitMapToGeofence();
    }
  }

  ngAfterViewInit() {
    // Map will be initialized when the component loads
  }

  onMapInit(map: google.maps.Map) {
    this.map = map;
    this.fitMapToGeofence();

    // Initialize clusters after map is ready
    setTimeout(() => {
      this.updateVehicleClusters();
      this.updateStopClusters();
    }, 500);
  }

  private updateVehicleClusters() {
    if (!this.map) return;

    // Clear existing clusterer
    if (this.vehicleClusterer) {
      this.vehicleClusterer.clearMarkers();
    }

    // Create Google Maps markers from vehicleMarkers data
    const markers = this.vehicleMarkers.map(markerData => {
      return new google.maps.Marker({
        position: markerData.position,
        title: markerData.title,
        icon: markerData.options.icon,
        zIndex: markerData.options.zIndex,
        // Store reference to original data
        ...{ markerData: markerData }
      });
    });

    // Add click listeners to markers
    markers.forEach(marker => {
      marker.addListener('click', () => {
        const data = (marker as any).markerData;
        if (data) {
          this.showInfoWindowForMarker(data);
        }
      });
    });

    // Create new clusterer
    this.vehicleClusterer = new MarkerClusterer({
      map: this.map,
      markers: markers,
      algorithm: new SuperClusterAlgorithm({
        radius: 50,
        minPoints: 3,
        maxZoom: 16
      }),
      renderer: {
        render: (cluster) => {
          // Custom cluster rendering
          const count = cluster.markers.length;
          const size = count < 10 ? 40 : count < 50 ? 50 : 60;

          return new google.maps.Marker({
            position: cluster.position,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: size / 8,
              fillColor: '#2196F3',
              fillOpacity: 0.8,
              strokeColor: '#FFFFFF',
              strokeWeight: 2
            },
            label: {
              text: count.toString(),
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 'bold'
            },
            zIndex: 1000
          });
        }
      }
    });
  }

  private updateStopClusters() {
    if (!this.map) return;

    // Clear existing clusterer
    if (this.stopClusterer) {
      this.stopClusterer.clearMarkers();
    }

    // Create Google Maps markers from stopMarkers data
    const markers = this.stopMarkers.map(markerData => {
      return new google.maps.Marker({
        position: markerData.position,
        title: markerData.title,
        icon: markerData.options.icon,
        zIndex: markerData.options.zIndex,
        // Store reference to original data
        ...{ markerData: markerData }
      });
    });

    // Add click listeners to markers
    markers.forEach(marker => {
      marker.addListener('click', () => {
        const data = (marker as any).markerData;
        if (data) {
          this.showInfoWindowForMarker(data);
        }
      });
    });

    // Create new clusterer for stops
    this.stopClusterer = new MarkerClusterer({
      map: this.map,
      markers: markers,
      algorithm: new SuperClusterAlgorithm({
        radius: 40,
        minPoints: 5,
        maxZoom: 15
      }),
      renderer: {
        render: (cluster) => {
          const count = cluster.markers.length;
          const size = count < 10 ? 40 : count < 30 ? 50 : 60;

          return new google.maps.Marker({
            position: cluster.position,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: size / 8,
              fillColor: '#F44336',
              fillOpacity: 0.8,
              strokeColor: '#FFFFFF',
              strokeWeight: 2
            },
            label: {
              text: count.toString(),
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 'bold'
            },
            zIndex: 1000
          });
        }
      }
    });
  }

  private showInfoWindowForMarker(markerData: MapMarkerData) {
    // Find the corresponding MapMarker component to open info window
    const markerRef = this.mapMarkers.find(m =>
      (m as any).markerData?.id === markerData.id
    );

    if (markerRef) {
      this.onMarkerClick(markerRef, markerData);
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
      return '#4CAF50';
    }
    return '#FF9800';
  }

  onMapClick() {
    if (this.infoWindow) {
      this.infoWindow.close();
    }
  }

  onMarkerClick(markerRef: MapMarker, markerData: MapMarkerData) {
    const data = markerData.data;
    this.selectedMarker = data;

    if (data.route_id) {
      // Vehicle marker info window
      const speedClass = data.speed === 0 ? 'text-amber-600' : 'text-emerald-600';
      const speedIcon = data.speed === 0 ? '●' : '▶';
      const isMoving = data.speed > 0;

      this.selectedInfo = `
        <div class="overflow-hidden rounded-lg bg-white shadow-lg">
          <!-- Header with route and vehicle -->
          <div class="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white px-4 py-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-sm font-semibold text-blue-700 px-2 py-1">${data.route_id}</span>
                <div>
                  <div class="text-xs font-medium text-gray-500 px-2 py-1">Route ${data.route_id}</div>
                  <div class="text-sm font-semibold text-gray-900 px-2 py-1">${data.vehicle_id}</div>
                </div>
              </div>
              <span class="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">${data.feed_agency}</span>
            </div>
          </div>
          
          <!-- Vehicle status -->
          <div class="px-4 py-3">
            <div class="mb-3 flex items-center gap-4">
              <div class="flex items-center gap-2">
                <div class="flex h-8 w-8 items-center justify-center rounded-full ${speedClass} bg-opacity-10 ${isMoving ? 'bg-emerald-50' : 'bg-amber-50'}">
                  <span class="text-lg ${speedClass}">${speedIcon}</span>
                </div>
                <div>
                  <div class="text-xs text-gray-500">Speed</div>
                  <div class="text-sm font-semibold ${speedClass}">${data.speed} km/h</div>
                </div>
              </div>
              
              <div class="flex items-center gap-2">
                <div class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50">
                  <span class="text-sm text-gray-600">${data.bearing}°</span>
                </div>
                <div>
                  <div class="text-xs text-gray-500">Direction</div>
                  <div class="text-xs font-medium text-gray-700">${this.getBearingDirection(data.bearing)}</div>
                </div>
              </div>
            </div>
            
            <!-- Last updated -->
            <div class="flex items-center gap-2 border-t border-gray-100 pt-2 text-xs text-gray-400">
              <span>🕒</span>
              <span>Updated ${this.getTimeAgo(data.observed_at)}</span>
            </div>
          </div>
          
          <!-- Coordinates (minimal) -->
          <div class="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
            ${data.lat.toFixed(4)}, ${data.lon.toFixed(4)}
          </div>
        </div>
      `;
    } else if (data.stop_name) {
      // Stop marker info window
      this.selectedInfo = `
        <div class="min-w-[220px] overflow-hidden rounded-lg bg-white shadow-lg">
          <div class="px-4 py-3">
            <div class="mb-2 flex items-start justify-between">
              <div>
                <div class="text-sm font-medium text-gray-500">Stop</div>
                <div class="text-base font-semibold text-gray-900">${data.stop_name}</div>
              </div>
              <span class="flex h-8 w-8 items-center justify-center rounded-full bg-red-50">
                <span class="text-red-500">📍</span>
              </span>
            </div>
            
            <div class="space-y-1 text-sm">
              <div class="flex items-center gap-2 text-gray-600">
                <span class="w-16 text-xs text-gray-400">ID</span>
                <span class="font-mono text-xs">${data.stop_id}</span>
              </div>
              <div class="flex items-center gap-2 text-gray-600">
                <span class="w-16 text-xs text-gray-400">Position</span>
                <span class="text-xs">${data.stop_lat.toFixed(4)}, ${data.stop_lon.toFixed(4)}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (data.type === 'user') {
      // User location info window
      this.selectedInfo = `
        <div class="min-w-[200px] overflow-hidden rounded-lg bg-white shadow-lg">
          <div class="px-4 py-3">
            <div class="mb-2 flex items-center gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                <span class="text-blue-500">👤</span>
              </div>
              <div>
                <div class="text-sm font-medium text-gray-500">Your Location</div>
                <div class="text-sm font-semibold text-gray-900">You are here</div>
              </div>
            </div>
            
            <div class="space-y-1 text-xs text-gray-500">
              <div>${data.location.lat.toFixed(6)}</div>
              <div>${data.location.lng.toFixed(6)}</div>
              <div class="pt-1 text-[10px] text-gray-400">📍 Exact position</div>
            </div>
          </div>
        </div>
      `;
    }

    this.markerClick.emit(data);
    this.infoWindow.open(markerRef);
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
  }

  onMapCenterChange() {
    // The center is handled by the google-map component
  }

  trackByMarkerId(index: number, marker: MapMarkerData): string {
    return marker.id;
  }
}