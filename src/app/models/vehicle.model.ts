export interface VehiclePosition {
    feed_agency: string;
    feed_category: string;
    observed_at: string;
    vehicle_id: string;
    trip_id: string;
    route_id: string;
    lat: number;
    lon: number;
    bearing: number;
    speed: number;
}

export interface VehicleMarker {
    position: google.maps.LatLngLiteral;
    title: string;
    options: google.maps.MarkerOptions;
    data: VehiclePosition;
}