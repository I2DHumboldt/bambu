# bambu

Proyecto del portal de datos del SiB Colombia ajustado a las necesidades del proyecto Ceiba.
Esta API expone los datos de los catálogos de información del Instituto Humboldt a traves de servicios REST.
El proyecto está basado en [Bambu](https://github.com/SIB-Colombia/bambu), desarrollado por el SIB Colombia.

## Documentación de la API (Link to Swagger docs)

## Requerimientos

Software  | Versión | Instrucciones de instalación
------------- | ------------- | -------------
Java | 1.8 o superior | (https://www.java.com/en/download/)
ElasticSearch | 5 | (https://www.elastic.co/products/elasticsearch)
Kibana (Optional) | 5 | (https://www.elastic.co/products/kibana)
NodeJS | 4 o superior | (https://nodejs.org/en/download/)
npm | 3.10.6 o superior | (https://docs.npmjs.com/getting-started/installing-node)

* Después de instalar Java se deben exportar las el JAVA_HOME. Ejemplo:

``` bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk1.8.0_101.jdk/Contents/Home/jre/
```

## Instalación

``` bash
git clone https://github.com/I2DHumboldt/bambu.git
npm install
```

## Configuración

La configuración de la aplicación se hace en el archivo de configuración `config/application-config.js` que usa el manejador
de configuraciones [convict](https://www.npmjs.com/package/convict). Los parámetros de configuración se listan en el siguiente JSON.

``` js
convict({
  appRoot: {
    doc: 'Application root folder.',
    default: `${__dirname}/..`
  },
  env: {
    doc: 'Application environment.',
    format: ['production', 'development'],
    default: 'development',
    env: 'NODE_ENV'
  },
  service: {
    name: {
      doc: 'The name of your service/platform.',
      default: 'Dataportal API Services',
      env: 'SERVICE_NAME'
    }
  },
  logs: {
    doc: 'Log save location',
    default: 'logs/dataportal-api.log',
    env: 'LOG'
  },
  server: {
    port: {
      doc: 'The server port to bind.',
      format: 'port',
      default: 5000,
      env: 'BAMBU_API_PORT'
    }
  },
  database: {
    elasticSearch: {
      url: {
        doc: 'ElasticSearch url to connect to (without including db reference)',
        default: 'localhost:9200',
        env: 'ESDBHOST'
      },
      index: {
        doc: 'ElasticSearch index db reference',
        default: 'sibdataportal',
        env: 'ESINDEX'
      }
    }
  }
})
```

Los valores de los parámetros se leen desde las variables de entorno del sistema que estén
definidas. Por ejemplo, si se quiere modificar el parámetro del nombre del servicio (*service*), se debe exportar una variable
de entorno del sistema: `export SERVICE_NAME='Nuevo nombre'`. De lo contrario la variable tendrá el valor por defecto (default): `'Dataportal API Services'`.

**Nota**: _Es importante que los parámetros de elasticSearch estén apuntando a la base de datos sobre la cual se realizó la importación
de los datos a travez del api-data-importer. 
Las variables de entorno que se deben definir en este caso son ESDBHOST y ESINDEX. 
Si esta aplicación está corriendo en el mismo servidor en que se realizó la importación, las variables deben ser las mismas que las usadas
por el [script de preparación del api-data-importer] (https://github.com/I2DHumboldt/api-data-importer/tree/master/dbscripts) 
que se ejecuta con **npm run prepare**_


## Puesta en marcha 
### Correr con PM2
Instale pm2

``` bash 
npm install pm2 -g
```

Ejecute el proceso

```
pm2 run proxy-api-ceiba.json
```

### Con nodeamon

``` bash
npm start
```

## Pruebas

``` bash
curl -X GET --header 'Accept: application/json' 'http://localhost:5000/api/v1.5/occurrence/count?isGeoreferenced=true'
```

Si hay datos en la base de datos de ElasticSearch se debe ver un mensaje como este:

``` bash
{count: 341}
```

