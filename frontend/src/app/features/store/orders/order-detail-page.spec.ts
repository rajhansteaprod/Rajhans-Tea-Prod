import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { OrderStore } from '../../../core/services/order.store';
import { OrderDetailPageComponent } from './order-detail-page';

describe('OrderDetailPageComponent', () => {
  let component: OrderDetailPageComponent;
  let fixture: ComponentFixture<OrderDetailPageComponent>;
  let mockOrderStore: jasmine.SpyObj<OrderStore>;
  let mockActivatedRoute: any;

  beforeEach(async () => {
    mockOrderStore = jasmine.createSpyObj('OrderStore', [
      'loadOrderDetail',
      'loadOrderTracking',
    ]);
    mockActivatedRoute = {
      paramMap: of(new Map([['id', 'test-order-id']])),
    };

    await TestBed.configureTestingModule({
      imports: [OrderDetailPageComponent],
      providers: [
        { provide: OrderStore, useValue: mockOrderStore },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderDetailPageComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should format status correctly', () => {
    expect(component.formatStatus('in_transit')).toBe('In Transit');
    expect(component.formatStatus('out_for_delivery')).toBe('Out For Delivery');
  });

  it('should return correct status color', () => {
    expect(component.getStatusColor('delivered')).toBe('#228B22');
    expect(component.getStatusColor('cancelled')).toBe('#DC143C');
  });

  it('should return correct status icon', () => {
    expect(component.getStatusIcon('delivered')).toBe('✓✓');
    expect(component.getStatusIcon('shipped')).toBe('📦');
  });

  it('should format date correctly', () => {
    const date = '2026-04-23T10:30:00Z';
    const formatted = component.formatDate(date);
    expect(formatted).toContain('23');
    expect(formatted).toContain('Apr');
    expect(formatted).toContain('2026');
  });
});
