import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { WarehouseListComponent } from './warehouse-list';

describe('WarehouseListComponent', () => {
  let component: WarehouseListComponent;
  let fixture: ComponentFixture<WarehouseListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WarehouseListComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(WarehouseListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
