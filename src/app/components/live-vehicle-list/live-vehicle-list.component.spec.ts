import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LiveVehicleListComponent } from './live-vehicle-list.component';

describe('LiveVehicleListComponent', () => {
  let component: LiveVehicleListComponent;
  let fixture: ComponentFixture<LiveVehicleListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LiveVehicleListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LiveVehicleListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
