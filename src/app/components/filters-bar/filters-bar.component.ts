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
  @Output() routeSelect = new EventEmitter<Route | null>();
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
    this.selectedCategory = '';
    this.selectedRoute = null;
    this.categories = [];
  
    this.routeSelect.emit(null);
    this.stopSearch.emit('');
  
    if (this.selectedAgency && this.feeds) {
      const staticFeeds = this.feeds.static.filter((f: any) => f.agency === this.selectedAgency);
      const realtimeFeeds = this.feeds.realtime.filter((f: any) => f.agency === this.selectedAgency);
  
      this.categories = [...new Set([
        ...staticFeeds.map((f: any) => f.category).filter(Boolean),
        ...realtimeFeeds.map((f: any) => f.category).filter(Boolean)
      ])].sort();
  
      this.agencyChange.emit(this.selectedAgency);
      this.categoryChange.emit('');
    } else {
      this.agencyChange.emit('');
      this.categoryChange.emit('');
    }
  }

  onCategorySelect() {
    this.selectedRoute = null;
    this.routeSelect.emit(null);
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
  
    this.routeSelect.emit(null);
    this.stopSearch.emit('');
    this.agencyChange.emit('');
    this.categoryChange.emit('');
  }
}