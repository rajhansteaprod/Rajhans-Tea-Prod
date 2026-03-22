import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrderHistoryPageComponent } from './order-history-page';

describe('OrderHistoryPageComponent', () => {
  let component: OrderHistoryPageComponent;
  let fixture: ComponentFixture<OrderHistoryPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderHistoryPageComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderHistoryPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
