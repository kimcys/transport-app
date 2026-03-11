import { Component, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { Feed } from '../../models/feed.model';
import { Route } from '../../models/route.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-filters-bar',
  templateUrl: './filters-bar.component.html',
  imports: [CommonModule, FormsModule]
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
  searchQuery = '';

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
      this.agencies = [...new Set([
        ...this.feeds.static,
        ...this.feeds.realtime
      ])];
    }
  }

  onAgencySelect() {
    if (this.selectedAgency && this.feeds) {
      // Extract categories for selected agency
      const staticFeeds = this.feeds.static.filter(f => f.startsWith(this.selectedAgency));
      const realtimeFeeds = this.feeds.realtime.filter(f => f.startsWith(this.selectedAgency));

      this.categories = [...new Set([
        ...staticFeeds.map(f => f.split('/')[1]),
        ...realtimeFeeds.map(f => f.split('/')[1])
      ])].filter(Boolean);

      this.agencyChange.emit(this.selectedAgency);
    }
  }

  onCategorySelect() {
    this.categoryChange.emit(this.selectedCategory);
  }

  onRouteSelect() {
    if (this.selectedRoute) {
      this.routeSelect.emit(this.selectedRoute);
    }
  }

  onSearchStop() {
    this.stopSearch.emit(this.searchQuery);
  }

  clearFilters() {
    this.selectedAgency = '';
    this.selectedCategory = '';
    this.selectedRoute = null;
    this.searchQuery = '';
    this.categories = [];
    this.agencyChange.emit('');
    this.categoryChange.emit('');
    this.stopSearch.emit('');
  }
}