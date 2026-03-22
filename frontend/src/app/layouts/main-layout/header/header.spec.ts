import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HeaderComponent } from './header';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with mega menu closed', () => {
    expect(component.megaOpen()).toBe(false);
  });

  it('should start with search closed', () => {
    expect(component.searchOpen()).toBe(false);
  });

  it('should start with mobile menu closed', () => {
    expect(component.mobileOpen()).toBe(false);
  });

  it('should toggle search', () => {
    component.toggleSearch();
    expect(component.searchOpen()).toBe(true);
    component.toggleSearch();
    expect(component.searchOpen()).toBe(false);
  });

  it('should close all panels via closeAll()', () => {
    component.megaOpen.set(true);
    component.mobileOpen.set(true);
    component.searchOpen.set(true);
    component.closeAll();
    expect(component.megaOpen()).toBe(false);
    expect(component.mobileOpen()).toBe(false);
    expect(component.searchOpen()).toBe(false);
  });
});
