import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CouponListComponent } from './coupon-list';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

describe('CouponListComponent', () => {
  let component: CouponListComponent;
  let fixture: ComponentFixture<CouponListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CouponListComponent, CommonModule, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(CouponListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty coupons array', () => {
    expect(component.coupons()).toEqual([]);
  });

  it('should toggle form visibility', () => {
    expect(component.showForm()).toBeFalsy();
    component.openForm();
    expect(component.showForm()).toBeTruthy();
    component.closeForm();
    expect(component.showForm()).toBeFalsy();
  });

  it('should reset form data when opening form', () => {
    component.openForm();
    expect(component.formData().discountType).toBe('percentage');
    expect(component.formData().scope).toBe('all');
    expect(component.formData().isActive).toBe(true);
  });

  it('should load coupons', () => {
    expect(component.isLoading()).toBeFalsy();
    component.loadCoupons();
    expect(component.isLoading()).toBeFalsy();
  });

  it('should close form after saving coupon', () => {
    component.openForm();
    component.saveCoupon();
    expect(component.showForm()).toBeFalsy();
  });

  it('should populate form when editing coupon', () => {
    const testCoupon = {
      _id: '1',
      code: 'TEST20',
      description: 'Test coupon',
      discountType: 'percentage' as const,
      discountValue: 20,
      minOrderAmount: 100,
      maxDiscountCap: 200,
      usageLimitTotal: 100,
      usageLimitPerUser: 2,
      usedCount: 0,
      validFrom: new Date(),
      validUntil: new Date(),
      scope: 'all' as const,
      isActive: true,
    };

    component.editCoupon(testCoupon);
    expect(component.showForm()).toBeTruthy();
    expect(component.formData().code).toBe('TEST20');
  });

  it('should toggle coupon status', () => {
    const testCoupon = {
      _id: '1',
      code: 'TEST20',
      description: 'Test coupon',
      discountType: 'percentage' as const,
      discountValue: 20,
      minOrderAmount: 100,
      maxDiscountCap: 200,
      usageLimitTotal: 100,
      usageLimitPerUser: 2,
      usedCount: 0,
      validFrom: new Date(),
      validUntil: new Date(),
      scope: 'all' as const,
      isActive: true,
    };

    component.toggleStatus(testCoupon);
    expect(testCoupon.isActive).toBeFalsy();
  });
});
