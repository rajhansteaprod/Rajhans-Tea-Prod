import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CatalogPageComponent } from './catalog-page';

describe('CatalogPageComponent', () => {
  let component: CatalogPageComponent;
  let fixture: ComponentFixture<CatalogPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CatalogPageComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CatalogPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
