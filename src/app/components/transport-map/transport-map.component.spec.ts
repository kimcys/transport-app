import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TransportMapComponent } from './transport-map.component';

describe('TransportMapComponent', () => {
  let component: TransportMapComponent;
  let fixture: ComponentFixture<TransportMapComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransportMapComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TransportMapComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
