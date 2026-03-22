import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductRailComponent } from './product-rail';

describe('ProductRailComponent', () => {
  let component: ProductRailComponent;
  let fixture: ComponentFixture<ProductRailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductRailComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductRailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});