import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JourneyOption, PlannerPoint, TripPlanResult } from '../../models/trip.model';
import { UserLocation } from '../../services/location.service';
import {
  GooglePlaceSuggestion,
  GoogleTripPlannerService
} from '../../services/google-trip-planner.service';

@Component({
  selector: 'app-trip-planner',
  imports: [CommonModule, FormsModule],
  templateUrl: './trip-planner.component.html',
  styleUrl: './trip-planner.component.css'
})
export class TripPlannerComponent {
  @Input() userLocation: UserLocation | null = null;

  @Output() journeySelect = new EventEmitter<JourneyOption | null>();

  originMode: 'current-location' | 'search' = 'current-location';
  originQuery = '';
  destinationQuery = '';
  originSuggestions: GooglePlaceSuggestion[] = [];
  destinationSuggestions: GooglePlaceSuggestion[] = [];
  selectedOriginPoint: PlannerPoint | null = null;
  selectedDestinationPoint: PlannerPoint | null = null;

  loading = false;
  error = '';
  result: TripPlanResult | null = null;
  selectedJourney: JourneyOption | null = null;

  constructor(private googleTripPlannerService: GoogleTripPlannerService) { }

  get recommendationEntries(): Array<{ label: string; journey: JourneyOption | null }> {
    if (!this.result) {
      return [];
    }

    return [
      { label: 'Best overall', journey: this.result.recommendations.bestOverall },
      { label: 'Fastest', journey: this.result.recommendations.fastest },
      { label: 'Least walking', journey: this.result.recommendations.leastWalking },
      { label: 'Fewest transfers', journey: this.result.recommendations.fewestTransfers },
      { label: 'Cheapest', journey: this.result.recommendations.cheapest },
      { label: 'Most reliable', journey: this.result.recommendations.mostReliable }
    ];
  }

  canPlanTrip(): boolean {
    if (this.originMode === 'current-location' && !this.userLocation) {
      return false;
    }

    if (this.originMode === 'search' && !this.selectedOriginPoint) {
      return false;
    }

    return !!this.selectedDestinationPoint;
  }

  setOriginMode(mode: 'current-location' | 'search') {
    this.originMode = mode;
    this.result = null;
    this.selectedJourney = null;
    this.selectedOriginPoint = null;
    this.journeySelect.emit(null);
  }

  onOriginQueryChange() {
    this.selectedOriginPoint = null;
    this.lookupPlaces(this.originQuery, true);
  }

  onDestinationQueryChange() {
    this.selectedDestinationPoint = null;
    this.lookupPlaces(this.destinationQuery, false);
  }

  chooseOriginSuggestion(suggestion: GooglePlaceSuggestion) {
    this.googleTripPlannerService.resolvePlace(suggestion.placeId).subscribe((point) => {
      if (!point) {
        return;
      }

      this.selectedOriginPoint = point;
      this.originQuery = `${suggestion.label}, ${suggestion.secondaryText}`;
      this.originSuggestions = [];
    });
  }

  chooseDestinationSuggestion(suggestion: GooglePlaceSuggestion) {
    this.googleTripPlannerService.resolvePlace(suggestion.placeId).subscribe((point) => {
      if (!point) {
        return;
      }

      this.selectedDestinationPoint = point;
      this.destinationQuery = `${suggestion.label}, ${suggestion.secondaryText}`;
      this.destinationSuggestions = [];
    });
  }

  planTrip() {
    const origin = this.getOriginPoint();
    const destination = this.selectedDestinationPoint;

    if (!origin || !destination) {
      return;
    }

    this.loading = true;
    this.error = '';

    this.googleTripPlannerService.planTransitJourneys(origin, destination).subscribe({
      next: (journeys) => {
        const recommendations = this.googleTripPlannerService.buildRecommendations(journeys);
        this.result = {
          originPoint: origin,
          destinationPoint: destination,
          originStops: [],
          destinationStops: [],
          journeys,
          recommendations
        };
        this.loading = false;
        this.selectJourney(recommendations.bestOverall ?? journeys[0] ?? null);
      },
      error: () => {
        this.loading = false;
        this.error = 'Google transit directions are unavailable for this search.';
      }
    });
  }

  selectJourney(journey: JourneyOption | null) {
    this.selectedJourney = journey;
    this.journeySelect.emit(journey);
  }

  formatDistance(distanceMeters: number): string {
    if (distanceMeters < 1000) {
      return `${distanceMeters} m`;
    }

    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }

  formatCurrency(amount: number): string {
    return `RM ${amount.toFixed(2)}`;
  }

  isSelected(journey: JourneyOption | null): boolean {
    return !!journey && this.selectedJourney?.id === journey.id;
  }

  private lookupPlaces(query: string, isOrigin: boolean) {
    const locationBias = this.userLocation ? { lat: this.userLocation.lat, lng: this.userLocation.lng } : undefined;

    this.googleTripPlannerService.searchPlaces(query, locationBias).subscribe((suggestions) => {
      if (isOrigin) {
        this.originSuggestions = suggestions;
      } else {
        this.destinationSuggestions = suggestions;
      }
    });
  }

  private getOriginPoint(): PlannerPoint | null {
    if (this.originMode === 'current-location' && this.userLocation) {
      return {
        type: 'current-location',
        label: 'Current location',
        lat: this.userLocation.lat,
        lng: this.userLocation.lng
      };
    }

    return this.selectedOriginPoint;
  }
}
