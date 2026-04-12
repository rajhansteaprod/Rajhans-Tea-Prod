import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BundleBuilderComponent } from './bundle-builder';

describe('BundleBuilderComponent', () => {
  let component: BundleBuilderComponent;
  let fixture: ComponentFixture<BundleBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BundleBuilderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BundleBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
