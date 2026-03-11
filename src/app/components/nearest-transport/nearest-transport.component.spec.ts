import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NearestTransportComponent } from './nearest-transport.component';

describe('NearestTransportComponent', () => {
  let component: NearestTransportComponent;
  let fixture: ComponentFixture<NearestTransportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NearestTransportComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NearestTransportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
