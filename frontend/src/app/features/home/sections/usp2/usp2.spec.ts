import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Usp2Component } from './usp2';

describe('Usp2Component', () => {
  let component: Usp2Component;
  let fixture: ComponentFixture<Usp2Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Usp2Component],
    }).compileComponents();

    fixture = TestBed.createComponent(Usp2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
