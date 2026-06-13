Feature: Example feature file

  Scenario: Example Scenario
    Given the UI is in state "S_HOME"
    When I perform transition "T_OPEN_CART"
    And after action I run hook "H_WAIT_CART_STORAGE"
    And after action I run hook "H_OPEN_CART_LINK"
    Then the UI should be in state "S_CART"

  Scenario: Another Example Scenario
    Given I use design class "scenarioData"
    Given the UI is in state "S_HOME"
    When I perform transition "T_OPEN_CART"
    And after action I run hook "H_STORE_ITEM_COST"
    And after action I run hook "H_APPEND_CART_ITEM"
    And after action I run hook "H_WAIT_CART_STORAGE"
    And after action I run hook "H_OPEN_CART_LINK"
    Then the UI should be in state "S_CART"
    And I assert "A_CART_ROWS_VISIBLE"
    And I assert "A_CART_TOTAL_MATCHES"
