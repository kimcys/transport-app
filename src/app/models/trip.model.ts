import { Route } from "./route.model";
import { Stop } from "./stop.model";
import { VehiclePosition } from "./vehicle.model";

export interface NearestTransport {
    stop: Stop;
    route: Route;
    departureTime: string;
    arrivalTime: string;
    vehicle?: VehiclePosition;
    distance: number;
}

export interface Calendar {
    service_id: string;
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
    start_date: string;
    end_date: string;
}