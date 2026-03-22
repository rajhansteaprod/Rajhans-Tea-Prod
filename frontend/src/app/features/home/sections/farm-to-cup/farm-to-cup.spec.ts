import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { FarmToCupComponent } from './farm-to-cup';

describe('FarmToCupComponent', () => {
  let component: FarmToCupComponent;
  let fixture: ComponentFixture<FarmToCupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FarmToCupComponent, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(FarmToCupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
