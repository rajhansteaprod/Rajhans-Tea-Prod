import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ExploreCtaComponent } from './explore-cta';

describe('ExploreCtaComponent', () => {
  let component: ExploreCtaComponent;
  let fixture: ComponentFixture<ExploreCtaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExploreCtaComponent, RouterTestingModule, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ExploreCtaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
