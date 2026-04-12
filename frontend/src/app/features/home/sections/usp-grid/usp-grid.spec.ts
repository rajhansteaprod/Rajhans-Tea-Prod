import { ComponentFixture, TestBed } from '@angular/core/testing';
import { USPGridComponent } from './usp-grid';

describe('USPGridComponent', () => {
  let component: USPGridComponent;
  let fixture: ComponentFixture<USPGridComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [USPGridComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(USPGridComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have 4 USP items', () => {
    expect(component.uspItems.length).toBe(4);
  });

  it('should render all USP items in template', () => {
    const items = fixture.nativeElement.querySelectorAll('.usp-grid__item');
    expect(items.length).toBe(4);
  });
});
