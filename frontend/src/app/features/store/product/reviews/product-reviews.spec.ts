import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ProductReviewsComponent } from './product-reviews';

describe('ProductReviewsComponent', () => {
  let component: ProductReviewsComponent;
  let fixture: ComponentFixture<ProductReviewsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductReviewsComponent, RouterTestingModule, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductReviewsComponent);
    component = fixture.componentInstance;
    component.productId = 'test-id';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
