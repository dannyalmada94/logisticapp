import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Alta } from './alta';

describe('Alta', () => {
  let component: Alta;
  let fixture: ComponentFixture<Alta>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Alta]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Alta);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
