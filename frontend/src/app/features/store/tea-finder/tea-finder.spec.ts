import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeaFinderComponent } from './tea-finder';

describe('TeaFinderComponent', () => {
  let component: TeaFinderComponent;
  let fixture: ComponentFixture<TeaFinderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeaFinderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TeaFinderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have 4 questions', () => {
    expect(component.questions.length).toBe(4);
  });

  it('should select answer', () => {
    component.selectAnswer('flavor', 'Strong & Bold');
    expect(component.selectedAnswers()['flavor']).toBe('Strong & Bold');
  });

  it('should navigate to next step', () => {
    expect(component.currentStep()).toBe(0);
    component.nextStep();
    expect(component.currentStep()).toBe(1);
  });

  it('should get recommendations', () => {
    component.selectAnswer('flavor', 'Strong & Bold');
    component.selectAnswer('caffeine', 'High Caffeine');
    component.selectAnswer('time', 'Any Time');
    component.selectAnswer('occasion', 'Daily Routine');
    component.getRecommendations();
    expect(component.recommendedTeas().length).toBeGreaterThan(0);
  });

  it('should reset quiz', () => {
    component.selectAnswer('flavor', 'Strong & Bold');
    component.nextStep();
    component.resetQuiz();
    expect(component.currentStep()).toBe(0);
    expect(component.selectedAnswers()).toEqual({});
  });
});
