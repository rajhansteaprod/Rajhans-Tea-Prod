import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AdminLayoutComponent } from './admin-layout';
import { AuthService } from '../../core/services/auth.service';
import { signal } from '@angular/core';

describe('AdminLayoutComponent', () => {
  let component: AdminLayoutComponent;
  let fixture: ComponentFixture<AdminLayoutComponent>;

  const mockAuthService = {
    user: signal(null),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminLayoutComponent, RouterTestingModule],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have sidebar closed by default', () => {
    expect(component.sidebarOpen()).toBe(false);
  });

  it('should toggle sidebar open state', () => {
    component.sidebarOpen.set(true);
    expect(component.sidebarOpen()).toBe(true);
  });

  it('should have nav sections defined', () => {
    expect(component.navSections.length).toBeGreaterThan(0);
  });

  it('should toggle section collapsed state', () => {
    const section = component.navSections[0];
    const initial = section.collapsed;
    component.toggleSection(section);
    expect(section.collapsed).toBe(!initial);
  });

  it('should return initials from getInitials()', () => {
    const result = component.getInitials();
    expect(result).toBeDefined();
  });
});
