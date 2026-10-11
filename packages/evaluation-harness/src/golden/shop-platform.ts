import type { GoldenSystem } from '../metrics.js';

/**
 * P8 -- FR-EVA-01: the golden system.
 *
 * A small but realistic two-module Spring platform with a docker-compose
 * deployment, written by hand together with its ground truth below. The
 * expectations were authored from reading these files -- what a careful
 * engineer would list -- not by running Phoenix and copying the result.
 *
 * Ground truth, briefly:
 *  - module `orders`: entities Customer (table customers) and Order (table
 *    orders, many-to-one Customer); REST controller OrderController on
 *    /orders with POST /orders, GET /orders/{id}, PUT /orders/{id}/cancel.
 *  - module `billing`: entity Invoice (table invoices); InvoiceController on
 *    /invoices with POST /invoices and GET /invoices/{id}.
 *  - deployment: compose project `shop` running `orders`, `billing` and `db`;
 *    both services depend on `db`.
 */

const pom = (artifactId: string) => `<?xml version="1.0"?>
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.shop</groupId>
  <artifactId>${artifactId}</artifactId>
  <version>1.0.0</version>
</project>
`;

const FILES: Record<string, string> = {
  'orders/pom.xml': pom('orders'),
  'orders/src/main/java/com/shop/orders/Customer.java': `package com.shop.orders;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "customers")
public class Customer {
  @Id
  private Long id;
  private String name;
}
`,
  'orders/src/main/java/com/shop/orders/Order.java': `package com.shop.orders;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "orders")
public class Order {
  @Id
  private Long id;
  private String status;
  @ManyToOne
  private Customer customer;
}
`,
  'orders/src/main/java/com/shop/orders/OrderController.java': `package com.shop.orders;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/orders")
public class OrderController {

  @PostMapping
  public Order createOrder(@RequestBody Order order) {
    return order;
  }

  @GetMapping("/{id}")
  public Order getOrder(@PathVariable Long id) {
    return null;
  }

  @PutMapping("/{id}/cancel")
  public Order cancelOrder(@PathVariable Long id) {
    return null;
  }
}
`,
  'billing/pom.xml': pom('billing'),
  'billing/src/main/java/com/shop/billing/Invoice.java': `package com.shop.billing;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "invoices")
public class Invoice {
  @Id
  private Long id;
  private String number;
}
`,
  'billing/src/main/java/com/shop/billing/InvoiceController.java': `package com.shop.billing;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/invoices")
public class InvoiceController {

  @PostMapping
  public Invoice issueInvoice(@RequestBody Invoice invoice) {
    return invoice;
  }

  @GetMapping("/{id}")
  public Invoice getInvoice(@PathVariable Long id) {
    return null;
  }
}
`,
  'docker-compose.yml': `name: shop
services:
  orders:
    image: shop/orders:1.0
    ports:
      - "8080:8080"
    depends_on:
      - db
  billing:
    image: shop/billing:1.0
    ports:
      - "8081:8080"
    depends_on:
      - db
  db:
    image: postgres:16
`,
};

export const SHOP_PLATFORM_GOLDEN: GoldenSystem = {
  systemId: 'shop-platform',
  description: 'Two-module Spring order/billing platform with a docker-compose deployment.',
  files: FILES,
  nodes: [
    { kind: 'domain.entity', label: 'Customer' },
    { kind: 'domain.entity', label: 'Order' },
    { kind: 'domain.entity', label: 'Invoice' },
    { kind: 'integration.api', label: 'OrderController' },
    { kind: 'integration.api', label: 'InvoiceController' },
    { kind: 'deployment.unit', label: 'orders' },
    { kind: 'deployment.unit', label: 'billing' },
    { kind: 'deployment.unit', label: 'db' },
    { kind: 'deployment.environment', label: 'shop' },
  ],
  edges: [
    { kind: 'hasAssociation', source: 'Order', target: 'Customer' },
    { kind: 'dependsOn', source: 'OrderController', target: 'Order' },
    { kind: 'dependsOn', source: 'InvoiceController', target: 'Invoice' },
    { kind: 'runsIn', source: 'orders', target: 'shop' },
    { kind: 'runsIn', source: 'billing', target: 'shop' },
    { kind: 'runsIn', source: 'db', target: 'shop' },
    { kind: 'dependsOn', source: 'orders', target: 'db' },
    { kind: 'dependsOn', source: 'billing', target: 'db' },
  ],
  clusters: [
    ['Customer', 'Order', 'OrderController'],
    ['Invoice', 'InvoiceController'],
  ],
  apiOperations: [
    'POST /orders',
    'GET /orders/{id}',
    'PUT /orders/{id}/cancel',
    'POST /invoices',
    'GET /invoices/{id}',
  ],
  tables: { Customer: 'customers', Order: 'orders', Invoice: 'invoices' },
};
