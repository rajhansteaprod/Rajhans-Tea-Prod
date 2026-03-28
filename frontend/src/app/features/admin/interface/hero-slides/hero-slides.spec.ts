import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HeroSlidesComponent } from './hero-slides';

describe('HeroSlidesComponent', () => {
  let component: HeroSlidesComponent;
  let fixture: ComponentFixture<HeroSlidesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeroSlidesComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HeroSlidesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
