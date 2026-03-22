import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { InventoryDashboardComponent } from './inventory-dashboard';

describe('InventoryDashboardComponent', () => {
  let component: InventoryDashboardComponent;
  let fixture: ComponentFixture<InventoryDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryDashboardComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(InventoryDashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
