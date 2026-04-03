import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FiltersBarComponent } from './filters-bar.component';

describe('FiltersBarComponent', () => {
  let component: FiltersBarComponent;
  let fixture: ComponentFixture<FiltersBarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FiltersBarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FiltersBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should disable the agency select while feeds are loading', () => {
    component.feedsLoading = true;
    fixture.detectChanges();

    const agencySelect: HTMLSelectElement = fixture.nativeElement.querySelector('select');

    expect(agencySelect.disabled).toBeTrue();
    expect(agencySelect.options[0].textContent?.trim()).toBe('Loading agencies...');
  });
});
