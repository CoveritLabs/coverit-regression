Feature: Example feature file

  Scenario: Example Scenario
    Given the UI is in state "S1"
    When I perform transition "T1"
    When I perform transition "T_OPEN_CART"
    Then the UI should be in state "S2"

  Scenario: Another Example Scenario
    Given the UI is in state "S1"
    When I perform transition "T1"
    And after action I run hook "storeItemCost"
    And after action I run hook "appendCartItem"
    When I perform transition "T_OPEN_CART"
    Then the UI should be in state "S2"
    And I assert "cartItemsMatchStoredData"
    And I assert "cartTotalMatchesStoredData"
