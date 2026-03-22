import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { SectionHeaderComponent } from './section-header';

describe('SectionHeaderComponent', () => {
  let component: SectionHeaderComponent;
  let fixture: ComponentFixture<SectionHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SectionHeaderComponent, RouterTestingModule],
    }).compileComponents();
    fixture = TestBed.createComponent(SectionHeaderComponent);
    component = fixture.componentInstance;
    component.headline = 'Test';
    fixture.detectChanges();
  });

  it('should create', () => { expect(component).toBeTruthy(); });
});
