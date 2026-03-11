export interface Route {
    route_id: string;
    route_short_name: string;
    route_long_name: string;
    route_type: number;
    route_color?: string;
    route_text_color?: string;
    agency_id?: string;
}

export interface Trip {
    trip_id: string;
    route_id: string;
    service_id: string;
    trip_headsign?: string;
    direction_id?: number;
}