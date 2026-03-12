import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Feed } from '../models/feed.model';
import { VehiclePosition } from '../models/vehicle.model';
import { Route, Trip } from '../models/route.model';
import { Stop, TripStop } from '../models/stop.model';
import { Calendar } from '../models/trip.model';

@Injectable({
  providedIn: 'root'
})
export class GtfsService {
  private apiUrl = 'https://transport-be.fly.dev/gtfs';

  constructor(private http: HttpClient) { }

  getFeeds(): Observable<Feed> {
    return this.http.get<Feed>(`${this.apiUrl}/feeds`);
  }

  getLatestVehiclePositions(agency?: string, category?: string, limit: number = 10000): Observable<VehiclePosition[]> {
    let params = new HttpParams().set('limit', limit.toString());

    if (agency) params = params.set('agency', agency);
    if (category) params = params.set('category', category);

    return this.http.get<VehiclePosition[]>(`${this.apiUrl}/vehicle-positions/latest`, { params });
  }

  getRoutes(agency: string, category?: string, query?: string, limit: number = 10000, offset: number = 0): Observable<Route[]> {
    let params = new HttpParams()
      .set('agency', agency)
      .set('limit', limit.toString())
      .set('offset', offset.toString());

    if (category) params = params.set('category', category);
    if (query) params = params.set('q', query);

    return this.http.get<Route[]>(`${this.apiUrl}/routes`, { params });
  }

  getTripsForRoute(agency: string, routeId: string, category?: string): Observable<Trip[]> {
    let params = new HttpParams().set('agency', agency);
    if (category) params = params.set('category', category);

    return this.http.get<Trip[]>(`${this.apiUrl}/routes/${routeId}/trips`, { params });
  }

  getStops(agency: string, category?: string, query?: string, limit: number = 10000, offset: number = 0): Observable<Stop[]> {
    let params = new HttpParams()
      .set('agency', agency)
      .set('limit', limit.toString())
      .set('offset', offset.toString());

    if (category) params = params.set('category', category);
    if (query) params = params.set('q', query);

    return this.http.get<Stop[]>(`${this.apiUrl}/stops`, { params });
  }

  getStopTimesForTrip(agency: string, tripId: string): Observable<TripStop[]> {
    const params = new HttpParams().set('agency', agency);
    return this.http.get<TripStop[]>(`${this.apiUrl}/trips/${tripId}/stop-times`, { params });
  }

  getCalendar(agency: string, category?: string, serviceId?: string): Observable<Calendar[]> {
    let params = new HttpParams().set('agency', agency);
    if (category) params = params.set('category', category);
    if (serviceId) params = params.set('service_id', serviceId);

    return this.http.get<Calendar[]>(`${this.apiUrl}/calendar`, { params });
  }

  extractAgenciesFromFeeds(feeds: Feed): string[] {
    const staticAgencies = feeds.static.map((feed: any) => feed.agency);
    const realtimeAgencies = feeds.realtime.map((feed: any) => feed.agency);
    
    return [...new Set([...staticAgencies, ...realtimeAgencies])];
  }
  
  extractCategoriesFromFeeds(feeds: Feed, agency: string): string[] {
    const staticFeeds = feeds.static.filter((feed: any) => feed.agency === agency);
    const realtimeFeeds = feeds.realtime.filter((feed: any) => feed.agency === agency);
  
    return [...new Set([
      ...staticFeeds.map((f: any) => f.category).filter(Boolean),
      ...realtimeFeeds.map((f: any) => f.category).filter(Boolean)
    ])];
  }
  
}