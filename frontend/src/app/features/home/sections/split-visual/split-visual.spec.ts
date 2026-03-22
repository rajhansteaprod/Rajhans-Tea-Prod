import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SplitVisualComponent } from './split-visual';
import { RouterModule } from '@angular/router';

describe('SplitVisualComponent', () => {
  let component: SplitVisualComponent;
  let fixture: ComponentFixture<SplitVisualComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SplitVisualComponent, RouterModule.forRoot([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SplitVisualComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
