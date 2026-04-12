import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ElementRef, ViewChild, ViewChildren, QueryList,
  signal, ChangeDetectorRef, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { CatalogService, Product } from '../../../../core/services/catalog.service';
import { PlatformService } from '../../../../core/services/platform.service';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';

// Only register GSAP plugin in browser
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

@Component({
  selector: 'app-product-preview',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-preview.html',
  styleUrls: ['./product-preview.scss'],
})
export class ProductPreviewComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('navBar')            navBar!:            ElementRef<HTMLElement>;
  @ViewChild('galleryPanel')      galleryPanel!:      ElementRef<HTMLElement>;
  @ViewChild('mainImageWrapper')  mainImageWrapper!:  ElementRef<HTMLElement>;
  @ViewChild('productTitle')      productTitle!:      ElementRef<HTMLElement>;
  @ViewChild('breadcrumb')        breadcrumb!:        ElementRef<HTMLElement>;
  @ViewChild('tagsRow')           tagsRow!:           ElementRef<HTMLElement>;
  @ViewChild('priceBlock')        priceBlock!:        ElementRef<HTMLElement>;
  @ViewChild('divider')           divider!:           ElementRef<HTMLElement>;
  @ViewChild('shortDesc')         shortDesc!:         ElementRef<HTMLElement>;
  @ViewChild('descSection')       descSection!:       ElementRef<HTMLElement>;
  @ViewChild('attrsSection')      attrsSection!:      ElementRef<HTMLElement>;
  @ViewChild('collectionsSection') collectionsSection!: ElementRef<HTMLElement>;
  @ViewChild('ctaSection')        ctaSection!:        ElementRef<HTMLElement>;
  @ViewChild('ctaBtn')            ctaBtn!:            ElementRef<HTMLButtonElement>;
  @ViewChild('thumbStrip')        thumbStrip!:        ElementRef<HTMLElement>;
  @ViewChild('viewer3dCanvas')    viewer3dCanvas!:    ElementRef<HTMLElement>;
  @ViewChild('viewer3dSection')   viewer3dSection!:   ElementRef<HTMLElement>;

  product       = signal<Product | null>(null);
  loading       = signal(true);
  error         = signal<string | null>(null);
  activeIdx     = signal(0);
  activeImage   = signal<string | null>(null);
  animatedPrice = signal('0');

  titleWords  = signal<string[]>([]);
  attrEntries = signal<{ key: string; value: string }[]>([]);

  private scrollTriggers: ScrollTrigger[] = [];
  private ctaMouseMove: ((e: MouseEvent) => void) | null = null;
  private ctaMouseLeave: (() => void) | null = null;
  private threeRenderer: THREE.WebGLRenderer | null = null;
  private threeAnimId: number | null = null;

  constructor(
    private route: ActivatedRoute,
    private catalog: CatalogService,
    private cdr: ChangeDetectorRef,
    private platform: PlatformService,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.catalog.getProduct(id).subscribe({
      next: (res) => {
        const p = res.data;
        this.product.set(p);
        this.titleWords.set(p.name.split(' '));
        this.attrEntries.set(
          Object.entries(p.attributes).map(([key, value]) => ({ key, value })),
        );
        if (p.images.length > 0) {
          this.activeImage.set(p.images[0]);
        }
        this.loading.set(false);
        this.cdr.detectChanges();
        // Run animations after view updates (browser only)
        if (this.platform.isBrowser) {
          setTimeout(() => this.initAnimations(), 80);
        }
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Failed to load product');
        this.loading.set(false);
        this.cdr.detectChanges();
      },
    });
  }

  ngAfterViewInit() {
    // Animations init after product loads (handled in subscribe)
  }

  ngOnDestroy() {
    this.scrollTriggers.forEach((t) => t.kill());
    if (this.ctaBtn?.nativeElement) {
      if (this.ctaMouseMove)  this.ctaBtn.nativeElement.removeEventListener('mousemove', this.ctaMouseMove);
      if (this.ctaMouseLeave) this.ctaBtn.nativeElement.removeEventListener('mouseleave', this.ctaMouseLeave);
    }
    if (this.threeAnimId) cancelAnimationFrame(this.threeAnimId);
    if (this.threeRenderer) {
      this.threeRenderer.dispose();
      this.threeRenderer.domElement.remove();
    }
  }

  switchImage(i: number) {
    if (i === this.activeIdx()) return;
    const p = this.product();
    if (!p) return;

    // Crossfade animation (browser only)
    if (this.platform.isBrowser && this.mainImageWrapper?.nativeElement) {
      const img = this.mainImageWrapper.nativeElement.querySelector('.main-image');
      if (img) {
        gsap.to(img, {
          opacity: 0, scale: 1.04, duration: 0.25, ease: 'power2.in',
          onComplete: () => {
            this.activeIdx.set(i);
            this.activeImage.set(p.images[i]);
            this.cdr.detectChanges();
            gsap.fromTo(img,
              { opacity: 0, scale: 1.04 },
              { opacity: 1, scale: 1, duration: 0.4, ease: 'power2.out' },
            );
          },
        });
      } else {
        this.activeIdx.set(i);
        this.activeImage.set(p.images[i]);
      }
    }
  }

  private initAnimations() {
    // Only run animations in browser
    if (!this.platform.isBrowser) return;

    const p = this.product();
    if (!p) return;

    // ── Entry Timeline ────────────────────────────────────────
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // Nav
    if (this.navBar?.nativeElement) {
      tl.from(this.navBar.nativeElement, { y: -64, opacity: 0, duration: 0.5 });
    }

    // Gallery panel
    if (this.galleryPanel?.nativeElement) {
      tl.from(this.galleryPanel.nativeElement, { x: -48, opacity: 0, duration: 0.7 }, '-=0.3');
    }

    // Breadcrumb
    if (this.breadcrumb?.nativeElement) {
      tl.from(this.breadcrumb.nativeElement, { x: -20, opacity: 0, duration: 0.4 }, '-=0.4');
    }

    // Title words — stagger each word
    const words = this.productTitle?.nativeElement?.querySelectorAll('.word');
    if (words?.length) {
      tl.from(words, { y: 48, opacity: 0, duration: 0.65, stagger: 0.07, ease: 'power4.out' }, '-=0.3');
    }

    // Tags stagger
    const tags = document.querySelectorAll('.tag');
    if (tags.length) {
      tl.from(tags, { y: 16, opacity: 0, stagger: 0.05, duration: 0.35 }, '-=0.3');
    }

    // Divider — expand width
    if (this.divider?.nativeElement) {
      tl.from(this.divider.nativeElement, { scaleX: 0, duration: 0.6, ease: 'power2.inOut' }, '-=0.2');
    }

    // Price — spring scale + count-up
    if (this.priceBlock?.nativeElement) {
      tl.from(this.priceBlock.nativeElement, {
        scale: 0.82, opacity: 0, duration: 0.6, ease: 'back.out(1.7)',
      }, '-=0.4');
    }

    // Count-up the price
    const countObj = { val: 0 };
    const targetPrice = p.basePrice;
    gsap.to(countObj, {
      val: targetPrice, duration: 1.4, ease: 'power2.out', delay: 0.6,
      onUpdate: () => {
        this.animatedPrice.set(Math.round(countObj.val).toLocaleString('en-IN'));
        this.cdr.detectChanges();
      },
    });

    // Short desc
    if (this.shortDesc?.nativeElement) {
      tl.from(this.shortDesc.nativeElement, { y: 20, opacity: 0, duration: 0.4 }, '-=0.3');
    }

    // Thumbnail strip
    if (this.thumbStrip?.nativeElement) {
      const thumbs = this.thumbStrip.nativeElement.querySelectorAll('.thumb');
      tl.from(thumbs, { y: 20, opacity: 0, stagger: 0.06, duration: 0.4 }, '-=0.5');
    }

    // ── ScrollTrigger Reveals ─────────────────────────────────

    // Description
    if (this.descSection?.nativeElement) {
      const st = gsap.from(this.descSection.nativeElement, {
        scrollTrigger: {
          trigger: this.descSection.nativeElement,
          start: 'top 82%',
          scroller: undefined,
        },
        y: 32, opacity: 0, duration: 0.6,
      });
      if (ScrollTrigger.getAll().at(-1)) this.scrollTriggers.push(ScrollTrigger.getAll().at(-1)!);
    }

    // Attributes — stagger grid items
    if (this.attrsSection?.nativeElement) {
      const attrItems = this.attrsSection.nativeElement.querySelectorAll('.attr-item');
      gsap.from(attrItems, {
        scrollTrigger: {
          trigger: this.attrsSection.nativeElement,
          start: 'top 82%',
          scroller: this.attrsSection.nativeElement.closest('.info-panel') ?? undefined,
        },
        y: 24, opacity: 0, scale: 0.96, stagger: 0.07, duration: 0.5, ease: 'power3.out',
      });
      if (ScrollTrigger.getAll().at(-1)) this.scrollTriggers.push(ScrollTrigger.getAll().at(-1)!);
    }

    // Collections — stagger from left
    if (this.collectionsSection?.nativeElement) {
      const chips = this.collectionsSection.nativeElement.querySelectorAll('.collection-chip');
      gsap.from(chips, {
        scrollTrigger: {
          trigger: this.collectionsSection.nativeElement,
          start: 'top 85%',
          scroller: this.collectionsSection.nativeElement.closest('.info-panel') ?? undefined,
        },
        x: -24, opacity: 0, stagger: 0.08, duration: 0.45,
      });
      if (ScrollTrigger.getAll().at(-1)) this.scrollTriggers.push(ScrollTrigger.getAll().at(-1)!);
    }

    // CTA — spring bounce
    if (this.ctaSection?.nativeElement) {
      gsap.from(this.ctaSection.nativeElement, {
        scrollTrigger: {
          trigger: this.ctaSection.nativeElement,
          start: 'top 90%',
          scroller: this.ctaSection.nativeElement.closest('.info-panel') ?? undefined,
        },
        y: 40, opacity: 0, duration: 0.6, ease: 'back.out(1.4)',
      });
      if (ScrollTrigger.getAll().at(-1)) this.scrollTriggers.push(ScrollTrigger.getAll().at(-1)!);
    }

    // ── CTA Magnetic Hover ────────────────────────────────────
    if (this.ctaBtn?.nativeElement) {
      const btn = this.ctaBtn.nativeElement;

      this.ctaMouseMove = (e: MouseEvent) => {
        const rect = btn.getBoundingClientRect();
        const x = (e.clientX - rect.left - rect.width  / 2) * 0.25;
        const y = (e.clientY - rect.top  - rect.height / 2) * 0.25;
        const mx = ((e.clientX - rect.left) / rect.width)  * 100;
        const my = ((e.clientY - rect.top)  / rect.height) * 100;
        btn.style.setProperty('--mx', `${mx}%`);
        btn.style.setProperty('--my', `${my}%`);
        gsap.to(btn, { x, y, duration: 0.4, ease: 'power2.out' });
      };

      this.ctaMouseLeave = () => {
        gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.5)' });
      };

      btn.addEventListener('mousemove', this.ctaMouseMove);
      btn.addEventListener('mouseleave', this.ctaMouseLeave);
    }

    // ── 3D Viewer ──────────────────────────────────────────────
    this.init3DViewer();
  }

  private init3DViewer() {
    // Only initialize 3D viewer in browser
    if (!this.platform.isBrowser) return;

    const container = this.viewer3dCanvas?.nativeElement;
    if (!container) return;

    const width = container.clientWidth;
    const height = 420;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f8f2);

    // Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 1.5, 5);
    camera.lookAt(0, 0.6, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);
    this.threeRenderer = renderer;

    // ── Product group ──
    const productGroup = new THREE.Group();

    // Tea container — cylinder body
    const bodyGeo = new THREE.CylinderGeometry(0.7, 0.7, 2.2, 64);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xcc5803,
      metalness: 0.1,
      roughness: 0.35,
      clearcoat: 0.4,
      clearcoatRoughness: 0.2,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.1;
    body.castShadow = true;
    productGroup.add(body);

    // Label band — slightly larger cylinder ring
    const labelGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.9, 64);
    const labelMat = new THREE.MeshPhysicalMaterial({
      color: 0xfcfff7,
      metalness: 0.0,
      roughness: 0.6,
    });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.y = 1.0;
    productGroup.add(label);

    // Gold accent ring top
    const ringGeoTop = new THREE.TorusGeometry(0.71, 0.02, 16, 64);
    const goldMat = new THREE.MeshPhysicalMaterial({
      color: 0xd4a84b,
      metalness: 0.9,
      roughness: 0.15,
    });
    const ringTop = new THREE.Mesh(ringGeoTop, goldMat);
    ringTop.rotation.x = Math.PI / 2;
    ringTop.position.y = 1.45;
    productGroup.add(ringTop);

    // Gold accent ring bottom
    const ringBottom = new THREE.Mesh(ringGeoTop, goldMat);
    ringBottom.rotation.x = Math.PI / 2;
    ringBottom.position.y = 0.55;
    productGroup.add(ringBottom);

    // Lid — slightly wider, shorter cylinder
    const lidGeo = new THREE.CylinderGeometry(0.74, 0.74, 0.18, 64);
    const lidMat = new THREE.MeshPhysicalMaterial({
      color: 0x3a2d32,
      metalness: 0.3,
      roughness: 0.2,
      clearcoat: 0.6,
    });
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.position.y = 2.29;
    lid.castShadow = true;
    productGroup.add(lid);

    // Lid knob
    const knobGeo = new THREE.SphereGeometry(0.12, 32, 32);
    const knob = new THREE.Mesh(knobGeo, goldMat);
    knob.position.y = 2.44;
    productGroup.add(knob);

    // Bottom ring
    const bottomGeo = new THREE.CylinderGeometry(0.74, 0.74, 0.06, 64);
    const bottom = new THREE.Mesh(bottomGeo, lidMat);
    bottom.position.y = 0.03;
    bottom.receiveShadow = true;
    productGroup.add(bottom);

    scene.add(productGroup);

    // ── Floor ──
    const floorGeo = new THREE.PlaneGeometry(12, 12);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.08 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    // ── Lighting ──
    const ambientLight = new THREE.AmbientLight(0xfcfff7, 0.6);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(3, 6, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.radius = 4;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xcc5803, 0.3);
    fillLight.position.set(-3, 2, -2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x57886c, 0.4);
    rimLight.position.set(0, 3, -5);
    scene.add(rimLight);

    // ── Mouse interaction ──
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let rotVelX = 0;
    let rotVelY = 0;
    let targetRotY = 0;
    let targetRotX = 0;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
      renderer.domElement.style.cursor = 'grabbing';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      rotVelX = dx * 0.008;
      rotVelY = dy * 0.005;
      targetRotY += rotVelX;
      targetRotX += rotVelY;
      targetRotX = Math.max(-0.5, Math.min(0.5, targetRotX));
      prevX = e.clientX;
      prevY = e.clientY;
    };

    const onPointerUp = () => {
      isDragging = false;
      renderer.domElement.style.cursor = 'grab';
    };

    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerUp);

    // ── Animation loop ──
    const animate = () => {
      this.threeAnimId = requestAnimationFrame(animate);

      // Auto-rotate when not dragging
      if (!isDragging) {
        targetRotY += 0.004;
        rotVelX *= 0.92;
        rotVelY *= 0.92;
      }

      // Smooth lerp
      productGroup.rotation.y += (targetRotY - productGroup.rotation.y) * 0.08;
      productGroup.rotation.x += (targetRotX - productGroup.rotation.x) * 0.08;

      renderer.render(scene, camera);
    };

    animate();

    // ── Scroll reveal ──
    if (this.viewer3dSection?.nativeElement) {
      gsap.from(this.viewer3dSection.nativeElement, {
        scrollTrigger: {
          trigger: this.viewer3dSection.nativeElement,
          start: 'top 85%',
          scroller: this.viewer3dSection.nativeElement.closest('.info-panel') ?? undefined,
        },
        y: 48, opacity: 0, duration: 0.7, ease: 'power3.out',
      });
      if (ScrollTrigger.getAll().at(-1)) this.scrollTriggers.push(ScrollTrigger.getAll().at(-1)!);
    }

    // ── Resize handler ──
    const onResize = () => {
      const w = container.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener('resize', onResize);
  }
}
