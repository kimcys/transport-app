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

export type PlannerPointType = 'current-location' | 'stop';

export interface PlannerPoint {
    type: PlannerPointType;
    label: string;
    lat: number;
    lng: number;
    stop?: Stop;
}

export interface PlannerStopCandidate {
    stop: Stop;
    distanceKm: number;
}

export type JourneyLegType = 'walk' | 'ride' | 'transfer';

export interface JourneyLeg {
    type: JourneyLegType;
    title: string;
    durationMinutes: number;
    distanceMeters?: number;
    route?: Route;
    fromStop?: Stop;
    toStop?: Stop;
    stopCount?: number;
}

export interface JourneyMapSegment {
    kind: 'walk' | 'transit';
    path: google.maps.LatLngLiteral[];
}

export interface JourneyMapMarker {
    id: string;
    label: string;
    position: google.maps.LatLngLiteral;
    kind: 'start' | 'end' | 'transfer';
}

export interface JourneyOption {
    id: string;
    label: string;
    summary: string;
    originStop: Stop;
    destinationStop: Stop;
    transferStop?: Stop;
    routes: Route[];
    totalDurationMinutes: number;
    waitingTimeMinutes: number;
    walkingTimeMinutes: number;
    inVehicleTimeMinutes: number;
    walkingDistanceMeters: number;
    transferCount: number;
    estimatedFare: number;
    reliabilityScore: number;
    departureTimeText: string;
    arrivalTimeText: string;
    legs: JourneyLeg[];
    mapSegments: JourneyMapSegment[];
    mapMarkers: JourneyMapMarker[];
}

export interface JourneyRecommendations {
    bestOverall: JourneyOption | null;
    fastest: JourneyOption | null;
    leastWalking: JourneyOption | null;
    fewestTransfers: JourneyOption | null;
    cheapest: JourneyOption | null;
    mostReliable: JourneyOption | null;
}

export interface TripPlanResult {
    originPoint: PlannerPoint;
    destinationPoint: PlannerPoint;
    originStops: PlannerStopCandidate[];
    destinationStops: PlannerStopCandidate[];
    journeys: JourneyOption[];
    recommendations: JourneyRecommendations;
}
