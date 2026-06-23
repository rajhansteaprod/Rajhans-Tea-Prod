import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeaFinderComponent } from './tea-finder';
import { CartStore } from '../../../core/services/cart.store';

describe('TeaFinderComponent', () => {
  let component: TeaFinderComponent;
  let fixture: ComponentFixture<TeaFinderComponent>;
  let mockCartStore: jasmine.SpyObj<CartStore>;

  beforeEach(async () => {
    mockCartStore = jasmine.createSpyObj('CartStore', ['addItem']);

    await TestBed.configureTestingModule({
      imports: [TeaFinderComponent],
      providers: [
        { provide: CartStore, useValue: mockCartStore }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TeaFinderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have 4 steps', () => {
    expect(component.steps.length).toBe(4);
  });

  it('should select an option', () => {
    component.selectOption('Kadak / Strong');
    expect(component.selectedOptions()[0]).toBe('Kadak / Strong');
  });

  it('should navigate to next step', () => {
    expect(component.currentStep()).toBe(0);
    component.goNext();
    expect(component.currentStep()).toBe(1);
  });

  it('should get recommendation and set products', () => {
    component.selectOption('Kadak / Strong');
    component.selectOption('Morning — First Cup');
    component.selectOption('More Milk, Less Water');
    component.selectOption('Under ₹300');
    
    component.getRecommendation();
    
    expect(component.recommendedProduct().name).toBe('Rajhans Roykan CTC');
    expect(component.showResults()).toBeTrue();
  });

  it('should reset quiz', () => {
    component.selectOption('Kadak / Strong');
    component.goNext();
    component.retakeQuiz();
    expect(component.currentStep()).toBe(0);
    expect(component.selectedOptions()).toEqual({});
    expect(component.showResults()).toBeFalse();
  });
});

