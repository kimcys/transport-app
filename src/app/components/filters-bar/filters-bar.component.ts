// filters-bar.component.ts
import { Component, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { Feed } from '../../models/feed.model';
import { Route } from '../../models/route.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NamePipe } from '../../pipes/name.pipe';

@Component({
  selector: 'app-filters-bar',
  templateUrl: './filters-bar.component.html',
  imports: [CommonModule, FormsModule, NamePipe]
})
export class FiltersBarComponent implements OnInit, OnChanges {
  @Input() feeds: Feed | null = null;
  @Input() routes: Route[] = [];
  @Input() loading = false;

  @Output() agencyChange = new EventEmitter<string>();
  @Output() categoryChange = new EventEmitter<string>();
  @Output() routeSelect = new EventEmitter<Route>();
  @Output() stopSearch = new EventEmitter<string>();

  selectedAgency = '';
  selectedCategory = '';
  selectedRoute: Route | null = null;

  agencies: string[] = [];
  categories: string[] = [];

  ngOnInit() {
    this.extractAgencies();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['feeds'] && this.feeds) {
      this.extractAgencies();
    }
  }

  extractAgencies() {
    if (this.feeds) {
      // Extract agency names from feed objects
      const staticAgencies = this.feeds.static.map((feed: any) => feed.agency);
      const realtimeAgencies = this.feeds.realtime.map((feed: any) => feed.agency);

      this.agencies = [...new Set([
        ...staticAgencies,
        ...realtimeAgencies
      ])].sort();
    }
  }

  onAgencySelect() {
    // Clear all dependent filters
    this.selectedCategory = '';
    this.selectedRoute = null;
    this.categories = [];

    if (this.selectedAgency && this.feeds) {
      // Extract categories for selected agency from feed objects
      const staticFeeds = this.feeds.static.filter((f: any) => f.agency === this.selectedAgency);
      const realtimeFeeds = this.feeds.realtime.filter((f: any) => f.agency === this.selectedAgency);

      // Get unique categories and filter out null values
      this.categories = [...new Set([
        ...staticFeeds.map((f: any) => f.category).filter(Boolean),
        ...realtimeFeeds.map((f: any) => f.category).filter(Boolean)
      ])].sort();

      // Emit agency change
      this.agencyChange.emit(this.selectedAgency);

      // If there are categories, "All Categories" is selected by default (empty string)
      // No need to emit category change since it's empty
    } else {
      // If agency is cleared, emit empty values
      this.agencyChange.emit('');
      this.categoryChange.emit('');
    }
  }

  onCategorySelect() {
    // Clear selected route when category changes
    this.selectedRoute = null;

    // Emit category change (empty string means "All Categories")
    this.categoryChange.emit(this.selectedCategory);
  }

  onRouteSelect() {
    if (this.selectedRoute) {
      this.routeSelect.emit(this.selectedRoute);
    }
  }

  clearFilters() {
    this.selectedAgency = '';
    this.selectedCategory = '';
    this.selectedRoute = null;
    this.categories = [];

    // Emit all clear events
    this.agencyChange.emit('');
    this.categoryChange.emit('');
  }
}