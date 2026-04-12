import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestimonialComponent } from './testimonial';

describe('TestimonialComponent', () => {
  let component: TestimonialComponent;
  let fixture: ComponentFixture<TestimonialComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestimonialComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestimonialComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have testimonials', () => {
    expect(component.testimonials.length).toBeGreaterThan(0);
  });

  it('should display testimonial quote', () => {
    expect(component.testimonials[0].quote).toBeTruthy();
  });

  it('should display author name', () => {
    expect(component.testimonials[0].name).toBe('Dr. Vibhuti');
  });
});
