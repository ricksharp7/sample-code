<template>
  <div class="inline-editor" :class="classes">
    <div v-if="editingValue !== null">
      <div class="d-flex">
        <v-text-field
          v-model="editingValue"
          :error-messages="textValidationErrors"
          @change="emitChange"
          @blur="emitBlur"
          @keypress="validateInput"
          @keyup.enter="updateValue"
          @keyup.esc="cancelEdit"
          :placeholder="placeholder"
          :required="required"
          :prefix="(type === 'currency' ? '$' : '')"
          :suffix="(type === 'percentage' ? '%' : '')"
          ref="input"
          :hide-details="collapseTextInput"
          :autofocus="autofocus"
        ></v-text-field>
        <v-btn flat icon @click="cancelEdit" color="red" class="flex-0">
          <v-icon>clear</v-icon>
        </v-btn>
        <v-btn flat icon @click="updateValue" color="green" class="flex-0">
          <v-icon>done</v-icon>
        </v-btn>
      </div>
    </div>
    <div v-else @click.stop="editValue" class="value-display">
      <span>{{ formattedValue }} <v-icon v-if="editIcon" @click.stop="editValue">{{ editIcon }}</v-icon></span>
    </div>
  </div>
</template>

<script>
import numberFunctionsMixin from '../mixins/NumberFunctions.vue'

export default {
  name: 'InlineTextEditor',
  computed: {
    classes () {
      let classNames = []
      if (this.className) {
        classNames.push(this.className)
      }
      if (this.hoverEffects) {
        classNames.push('hover-effects')
      }
      if (this.editingValue !== null) {
        classNames.push('editing')
      }
      if (this.disabled) {
        classNames.push('disabled')
      }
      classNames.push('type-' + this.type)
      return classNames.join(' ')
    },
    collapseTextInput () {
      if (!this.collapsible) {
        return false
      }
      return this.textValidationErrors.length < 1
    },
    formattedValue () {
      if (this.type === 'currency') {
        return this.formatCurrency(this.internalValue, 0)
      }
      if (this.type === 'percentage') {
        return this.internalValue + '%'
      }
      return this.internalValue
    }
  },
  data () {
    return {
      editingValue: null,
      internalValue: this.value,
      textValidationErrors: []
    }
  },
  methods: {
    cancelEdit () {
      this.closeEditor()
    },
    closeEditor () {
      this.editingValue = null
      this.$emit('close')
    },
    editValue () {
      if (this.disabled) {
        return
      }
      if (this.internalValue === null) {
        // Clicking into an empty editor, set to an empty string
        this.editingValue = ''
      } else {
        this.editingValue = this.internalValue
      }
      this.filterValue()

      // Set the focus to the input
      window.setTimeout(() => {
        this.focus()
      }, 10)
      this.$emit('open')
    },
    emitBlur (e) {
      this.validate()
      this.$emit('blur', e)
      if (this.closeOnBlur === true) {
        this.updateValue()
      }
    },
    emitChange (e) {
      this.validate()
      this.$emit('change', e)
    },
    filterValue () {
      if (this.editingValue === null) {
        return
      }
      if (['number', 'currency', 'percentage'].indexOf(this.type) > -1) {
        this.editingValue = this.editingValue.toString().replace(/[^0-9.]/g, '')
      }
    },
    focus () {
      try {
        this.$nextTick(() => {
          this.$refs.input.$el.children[0].children[0].focus()
        })
      } catch (ignore) {}
    },
    updateValue () {
      this.validate()
      if (this.textValidationErrors.length) {
        return false
      }
      if (this.internalValue !== this.editingValue) {
        this.internalValue = this.editingValue
        this.$nextTick(() => {
          this.$emit('update')
        })
      }
      this.closeEditor()
    },
    validate () {
      let errors = []
      this.filterValue()
      if (this.required && !this.editingValue) {
        errors.push('This value is required')
      } else if (this.minLength && this.editingValue && (this.editingValue.length < this.minLength)) {
        errors.push('Must be at least ' + this.minLength + ' characters')
      } else if (this.maxLength && this.editingValue && (this.editingValue.length > this.maxLength)) {
        errors.push('Max ' + this.maxLength + ' characters allowed')
      } else if (this.maxValue && this.editingValue) {
        let value = this.parseFloat(this.editingValue)
        if (value) {
          value = parseFloat(value)
          if (value > this.maxValue) {
            errors.push('Value cannot exceed ' + this.formatCurrency(this.maxValue))
          }
        }
      }
      this.textValidationErrors = errors
    },
    validateInput (evt) {
      // Only for number, currency, and percentage fields
      if (['number', 'currency', 'percentage'].indexOf(this.type) === -1) {
        return
      }

      // Get the key code
      evt = (evt) || window.event
      var charCode = (evt.which) ? evt.which : evt.keyCode

      // Verify that it's a number or control key
      if ((charCode > 31 && (charCode < 48 || charCode > 57)) && charCode !== 46) {
        evt.preventDefault()
      } else {
        return true
      }
    }
  },
  mixins: [
    numberFunctionsMixin
  ],
  mounted () {
    // If this field is required, but is empty, open the editor
    if (this.required) {
      if ((this.internalValue === '') || (this.internalValue === null)) {
        this.editingValue = ''
      }
    }
  },
  props: {
    autofocus: {
      type: Boolean,
      default: false
    },
    className: {
      type: String,
      default: ''
    },
    closeOnBlur: {
      type: Boolean,
      default: false
    },
    collapsible: {
      type: Boolean,
      default: false
    },
    disabled: {
      type: Boolean,
      default: false
    },
    editIcon: {
      type: String,
      default: null
    },
    hoverEffects: {
      type: Boolean,
      default: false
    },
    maxLength: {
      type: Number,
      default: null
    },
    minLength: {
      type: Number,
      default: null
    },
    maxValue: {
      type: Number,
      default: null
    },
    placeholder: {
      type: String,
      default: null
    },
    required: {
      type: Boolean,
      default: false
    },
    type: {
      type: String,
      default: 'text',
      validator (value) {
        return ['text', 'number', 'currency', 'percentage'].indexOf(value) > -1
      }
    },
    value: {
      required: true
    }
  },
  watch: {
    internalValue (newValue) {
      this.$emit('update:value', newValue)
    },
    value (newValue) {
      this.internalValue = newValue
    }
  }
}
</script>

<style lang="scss">
.inline-editor{

  cursor: text;
  
  .btn--icon{
    margin: 20px 0 0;
    min-width: 24px;
    height:24px;
  }

  &.type-number,
  &.type-currency,
  &.type-percentage{
    margin-left: 10px;

    .input-group{
      max-width:120px;

      input{
        text-align: right;
      }
    }
  }

  &.hover-effects:not(.disabled){
    border:dashed 1px transparent;
  }
  &.hover-effects:not(.editing):not(.disabled){
    &:hover{
      border-color: #aaa;
    }
  }

  &:not(.editing){
    max-width:100%;
  }

  .value-display{
    min-height:19px;
    min-width: 55px;
    width:100%;
    display: inline-block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;

    .icon{
      opacity: 0;
      cursor: pointer;
    }

    &:hover{
      .icon{
        opacity: 1;
      }
    }
  }

  &.disabled{
    cursor:not-allowed;

    .value-display{
      cursor: not-allowed;
    }
  }
}
</style>