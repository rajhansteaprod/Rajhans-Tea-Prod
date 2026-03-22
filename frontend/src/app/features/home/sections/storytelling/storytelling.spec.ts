import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { StorytellingComponent } from './storytelling';

describe('StorytellingComponent', () => {
  let component: StorytellingComponent;
  let fixture: ComponentFixture<StorytellingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StorytellingComponent, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(StorytellingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
