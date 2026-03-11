export interface Stop {
    stop_id: string;
    stop_name: string;
    stop_lat: number;
    stop_lon: number;
    stop_code?: string;
    stop_desc?: string;
    zone_id?: string;
}

export interface StopMarker {
    position: google.maps.LatLngLiteral;
    title: string;
    options: google.maps.MarkerOptions;
    data: Stop;
}

export interface TripStop {
    stop_sequence: number;
    stop_id: string;
    stop_name: string;
    arrival_time: string;
    departure_time: string;
    stop_lat: number;
    stop_lon: number;
    pickup_type?: number;
    drop_off_type?: number;
}